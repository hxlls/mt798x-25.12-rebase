/*
 * hnat-bwmon.c - HNAT-aware bandwidth monitor for MediaTek OpenWrt routers
 *
 * Reads MediaTek HNAT FOE entries via debugfs to accurately track per-client
 * bandwidth usage even when traffic is HW-offloaded.
 *
 * Usage: hnat-bwmon [-4|-6] -f <output_file>
 *        hnat-bwmon -l <MAC>          list per-flow details for a client
 *
 * Compatible with luci-app-hnatwrtmon. Output CSV format:
 *   MAC,IP,hostname,delta_dl,delta_ul,cumulative_dl,cumulative_ul,total,first_seen,last_seen
 */
#define _GNU_SOURCE
#include <ctype.h>
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define HNAT_DEBUGFS      "/sys/kernel/debug/hnat"
#define HNAT_ALL_ENTRY    HNAT_DEBUGFS "/all_entry"
#define HNAT_WAN_IF       HNAT_DEBUGFS "/hnat_wan_if"
#define SYS_NET_CLASS     "/sys/class/net"
#define DB_DIR            "/var/lib/hnatbwmon"
#define STATE_FILE        DB_DIR "/.state"
#define MAX_LINE          4096
#define MAX_CLIENTS       512

struct client_state {
	char mac[18];
	char ip[64];
	uint64_t cur_dl;
	uint64_t cur_ul;
	uint64_t prev_raw_dl;
	uint64_t prev_raw_ul;
	uint64_t cum_dl;
	uint64_t cum_ul;
	time_t first_seen;
	time_t last_seen;
	int active;
};

static struct client_state clients[MAX_CLIENTS];
static int num_clients;

static char wan_mac[18];

static char router_macs[8][18];
static int router_mac_count;

static char hostname_cache[512][128];
static char hostname_ip_map[512][64];
static int hostname_cache_count;
static time_t hostname_mtime;
static int hostname_loaded;

static void add_router_mac(const char *mac)
{
	if (!mac || !mac[0] || strcmp(mac, "00:00:00:00:00:00") == 0)
		return;
	for (int i = 0; i < router_mac_count; i++)
		if (!strcasecmp(router_macs[i], mac))
			return;
	if (router_mac_count < 8) {
		strncpy(router_macs[router_mac_count], mac, 17);
		router_mac_count++;
	}
}

static int is_router_mac(const char *mac)
{
	for (int i = 0; i < router_mac_count; i++)
		if (!strcasecmp(router_macs[i], mac))
			return 1;
	return 0;
}

static struct ip_mac_entry {
	char ip[64];
	char mac[18];
} ip_map[256];
static int ip_map_count;

#define MAX_IP_MAP 256

static void add_ip_map(const char *ip, const char *mac)
{
	if (!ip || !ip[0] || !strcmp(ip, "0.0.0.0")) return;
	if (ip_map_count >= MAX_IP_MAP) return;
	for (int i = 0; i < ip_map_count; i++)
		if (!strcasecmp(ip_map[i].mac, mac))
			return;
	strncpy(ip_map[ip_map_count].ip, ip, sizeof(ip_map[0].ip) - 1);
	strncpy(ip_map[ip_map_count].mac, mac, sizeof(ip_map[0].mac) - 1);
	ip_map_count++;
}

static void trim(char *s)
{
	int len = strlen(s);
	while (len > 0 && (s[len - 1] == '\n' || s[len - 1] == '\r' || s[len - 1] == ' '))
		s[--len] = '\0';
	while (*s == ' ' || *s == '\t') {
		memmove(s, s + 1, len);
		len--;
	}
}

static struct client_state *find_client(const char *mac)
{
	for (int i = 0; i < num_clients; i++)
		if (!strcasecmp(clients[i].mac, mac))
			return &clients[i];
	return NULL;
}

static struct client_state *add_client(const char *mac)
{
	struct client_state *c;
	if (num_clients >= MAX_CLIENTS)
		return NULL;
	c = &clients[num_clients++];
	memset(c, 0, sizeof(*c));
	strncpy(c->mac, mac, sizeof(c->mac) - 1);
	c->active = 1;
	c->first_seen = time(NULL);
	c->last_seen = time(NULL);
	return c;
}

static void read_wan_mac(void)
{
	char ifname[64] = {};
	char path[256];
	char mac[64];
	FILE *fp;
	const char *lan_ifaces[] = { "br-lan", "br0", "lan", NULL };
	int i;

	fp = fopen(HNAT_WAN_IF, "r");
	if (fp) {
		if (fgets(ifname, sizeof(ifname), fp)) {
			trim(ifname);
			if (strlen(ifname)) {
				snprintf(path, sizeof(path), SYS_NET_CLASS "/%s/address", ifname);
				fp = freopen(path, "r", fp);
				if (fp && fgets(mac, sizeof(mac), fp)) {
					trim(mac);
					strncpy(wan_mac, mac, sizeof(wan_mac) - 1);
					add_router_mac(wan_mac);
				}
			}
		}
		if (fp) fclose(fp);
	}

	for (i = 0; lan_ifaces[i]; i++) {
		snprintf(path, sizeof(path), SYS_NET_CLASS "/%s/address", lan_ifaces[i]);
		fp = fopen(path, "r");
		if (fp) {
			if (fgets(mac, sizeof(mac), fp)) {
				trim(mac);
				add_router_mac(mac);
			}
			fclose(fp);
		}
	}
}

static void load_state(void)
{
	FILE *fp = fopen(STATE_FILE, "r");
	char line[MAX_LINE], mac[18];
	unsigned long long raw_dl, raw_ul, cum_dl, cum_ul, fs;
	struct client_state *c;

	if (!fp)
		return;

	while (fgets(line, sizeof(line), fp)) {
		if (sscanf(line, "%17s %llu %llu %llu %llu %llu",
			   mac, &raw_dl, &raw_ul, &cum_dl, &cum_ul, &fs) >= 5) {
			c = find_client(mac);
			if (!c)
				c = add_client(mac);
			if (c) {
				c->prev_raw_dl = raw_dl;
				c->prev_raw_ul = raw_ul;
				c->cum_dl = cum_dl;
				c->cum_ul = cum_ul;
				if (fs > 0)
					c->first_seen = fs;
			}
		}
	}
	fclose(fp);
}

static const char *lookup_mac_by_ip(const char *ip)
{
	if (!ip || !ip[0])
		return NULL;
	for (int i = 0; i < ip_map_count; i++)
		if (!strcmp(ip_map[i].ip, ip))
			return ip_map[i].mac;
	return NULL;
}

static const char *lookup_ip_by_mac(const char *mac)
{
	if (!mac || !mac[0])
		return NULL;
	for (int i = 0; i < ip_map_count; i++)
		if (!strcasecmp(ip_map[i].mac, mac))
			return ip_map[i].ip;
	return NULL;
}

static void load_dhcp_leases(void)
{
	FILE *fp;
	char line[MAX_LINE], ip[64], mac[18];

	fp = fopen("/tmp/dhcp.leases", "r");
	if (fp) {
		while (fgets(line, sizeof(line), fp) && ip_map_count < MAX_IP_MAP) {
			if (sscanf(line, "%*s %17s %63s", mac, ip) == 2) {
				if (is_router_mac(mac)) continue;
				add_ip_map(ip, mac);
			}
		}
		fclose(fp);
	}

	fp = fopen("/proc/net/arp", "r");
	if (fp) {
		fgets(line, sizeof(line), fp);
		while (fgets(line, sizeof(line), fp) && ip_map_count < MAX_IP_MAP) {
			char flags[16], ifname[16];
			if (sscanf(line, "%63s %*s %15s %17s %*s %15s", ip, flags, mac, ifname) < 3)
				continue;
			if (!strcmp(flags, "0x0"))
				continue;
			if (strstr(ifname, "wan") || strstr(ifname, "ppp"))
				continue;
			if (is_router_mac(mac)) continue;
			if (lookup_ip_by_mac(mac)) continue;
			add_ip_map(ip, mac);
		}
		fclose(fp);
	}
}

static int is_invalid_mac(const char *mac)
{
	return !mac || !mac[0] || !strcmp(mac, "00:00:00:00:00:00");
}

static void save_state(void)
{
	FILE *fp = fopen(STATE_FILE, "w");
	if (!fp)
		return;
	for (int i = 0; i < num_clients; i++) {
		if (!clients[i].active)
			continue;
		fprintf(fp, "%s %llu %llu %llu %llu %llu\n",
			clients[i].mac,
			(unsigned long long)clients[i].cur_dl,
			(unsigned long long)clients[i].cur_ul,
			(unsigned long long)clients[i].cum_dl,
			(unsigned long long)clients[i].cum_ul,
			(unsigned long long)clients[i].first_seen);
	}
	fclose(fp);
}

static int parse_hnat_line(char *line,
			   char *smac_out, char *dmac_out,
			   uint64_t *bytes_out, char *ip_out,
			   char *nsip_out)
{
	char *p;
	int i;

	p = strstr(line, "bytes=");
	if (!p)
		return -1;
	p += 6;
	*bytes_out = strtoull(p, NULL, 10);

	p = strstr(line, "|smac=");
	if (!p)
		return -1;
	p += 6;
	for (i = 0; i < 17 && *p && *p != '-' && *p != '='; i++, p++)
		smac_out[i] = *p;
	smac_out[i] = '\0';

	p = strstr(line, "->dmac=");
	if (p) {
		p += 7;
	} else {
		p = strstr(line, "=>ndmac=");
		if (p) p += 8;
	}
	if (!p)
		return -1;
	for (i = 0; i < 17 && *p && *p != '|' && *p != '\n' && *p != '\r'; i++, p++)
		dmac_out[i] = *p;
	dmac_out[i] = '\0';

	ip_out[0] = '\0';
	p = strstr(line, "|SIP=");
	if (p) {
		p += 5;
		for (i = 0; i < 63 && *p && *p != '(' && *p != '|' && *p != '\n'; i++)
			ip_out[i] = *p++;
		ip_out[i] = '\0';
	}

	nsip_out[0] = '\0';
	p = strstr(line, "=>NSIP=");
	if (p) {
		p += 7;
		for (i = 0; i < 63 && *p && *p != '(' && *p != '|' && *p != '-' && *p != '\n'; i++)
			nsip_out[i] = *p++;
		nsip_out[i] = '\0';
	}

	return 0;
}

struct flow_detail {
	char sip[64];
	char dip[64];
	int sport;
	int dport;
	int proto;
	uint64_t bytes;
	int is_download;
};

static int parse_hnat_line_v2(char *line, struct flow_detail *fd)
{
	char *p, *end;
	int i;

	memset(fd, 0, sizeof(*fd));

	p = strstr(line, "bytes=");
	if (!p)
		return -1;
	p += 6;
	fd->bytes = strtoull(p, NULL, 10);

	p = strstr(line, "|prot=");
	if (p) {
		p += 6;
		fd->proto = (int)strtol(p, NULL, 10);
	}

	p = strstr(line, "|SIP=");
	if (!p)
		return -1;
	p += 5;

	for (i = 0; i < 63 && *p && *p != '(' && *p != '-' && *p != '|' && *p != '\n'; i++, p++)
		fd->sip[i] = *p;
	fd->sip[i] = '\0';

	if (*p == '(' && strncmp(p, "(sp=", 4) == 0) {
		p += 4;
		fd->sport = (int)strtol(p, &end, 10);
		p = end;
		if (*p == ')') p++;
	}

	if (strncmp(p, "->DIP=", 6) == 0 || strncmp(p, "=>NDIP=", 7) == 0) {
		if (*p == '=') {
			p++;
			while (*p && *p != 'D') p++;
		}
		p = strstr(p, "->DIP=");
		if (!p)
			p = strstr(line, "->DIP=");
		if (!p) {
			p = strstr(line, "|NDIP=");
			if (p) p += 1;
		}
		if (!p)
			return -1;
		p += (strncmp(p, "->", 2) == 0 ? 6 : 4);
	}
	if (!p)
		return -1;

	for (i = 0; i < 63 && *p && *p != '(' && *p != '|' && *p != '-' && *p != '\n'; i++, p++)
		fd->dip[i] = *p;
	fd->dip[i] = '\0';

	if (*p == '(' && strncmp(p, "(dp=", 4) == 0) {
		p += 4;
		fd->dport = (int)strtol(p, &end, 10);
	}

	return 0;
}

static void list_flows_for_mac(const char *target_mac)
{
	FILE *fp = fopen(HNAT_ALL_ENTRY, "r");
	char line[MAX_LINE], smac[18], dmac[18], ip[64], nsip[64];
	uint64_t bytes;
	struct flow_detail fd;
	const char *resolved;

	if (!fp) {
		fprintf(stderr, "Warning: cannot open %s: %s\n", HNAT_ALL_ENTRY, strerror(errno));
		return;
	}

	read_wan_mac();
	load_dhcp_leases();

	while (fgets(line, sizeof(line), fp)) {
		if (parse_hnat_line(line, smac, dmac, &bytes, ip, nsip) < 0)
			continue;
		if (bytes == 0)
			continue;

		resolved = NULL;

		int match_upload = !strcasecmp(smac, target_mac) && !is_router_mac(smac) && !is_invalid_mac(smac);
		int match_download = !strcasecmp(dmac, target_mac) && (is_router_mac(smac) || is_invalid_mac(smac));
		int match_nsip = 0;

		if (is_router_mac(smac) && is_router_mac(dmac) && nsip[0]) {
			resolved = lookup_mac_by_ip(nsip);
			if (!resolved && ip[0])
				resolved = lookup_mac_by_ip(ip);
			if (resolved && !strcasecmp(resolved, target_mac))
				match_nsip = 1;
		}

		if (!match_upload && !match_download && !match_nsip)
			continue;

		if (parse_hnat_line_v2(line, &fd) < 0) {
			printf("-,%s,-,%s,-,%llu,%s\n",
			       ip[0] ? ip : "0.0.0.0",
			       "0.0.0.0",
			       (unsigned long long)bytes,
			       (match_upload || match_nsip) ? "up" : "down");
			continue;
		}

		printf("%d,%s,%d,%s,%d,%llu,%s\n",
		       fd.proto,
		       fd.sip[0] ? fd.sip : "0.0.0.0",
		       fd.sport,
		       fd.dip[0] ? fd.dip : "0.0.0.0",
		       fd.dport,
		       (unsigned long long)fd.bytes,
		       (match_upload || match_nsip) ? "up" : "down");
	}

	fclose(fp);
}

static void scan_foe_table(void)
{
	FILE *fp = fopen(HNAT_ALL_ENTRY, "r");
	char line[MAX_LINE], smac[18], dmac[18], ip[64], nsip[64];
	const char *client_mac, *lan_ip;
	uint64_t bytes;
	struct client_state *c;
	int i;

	if (!fp) {
		fprintf(stderr, "Warning: cannot open %s: %s\n", HNAT_ALL_ENTRY, strerror(errno));
		return;
	}

	load_dhcp_leases();

	while (fgets(line, sizeof(line), fp)) {
		if (parse_hnat_line(line, smac, dmac, &bytes, ip, nsip) < 0)
			continue;
		if (is_invalid_mac(smac) && is_invalid_mac(dmac))
			continue;
		if (bytes == 0)
			continue;

		if (!is_router_mac(smac) && !is_invalid_mac(smac)) {
			client_mac = smac;
			c = find_client(client_mac);
			if (!c)
				c = add_client(client_mac);
			if (c) {
				c->cur_ul += bytes;
				c->last_seen = time(NULL);
			}
			if (nsip[0])
				add_ip_map(nsip, smac);
		} else if ((is_router_mac(smac) || is_invalid_mac(smac)) && !is_router_mac(dmac) && !is_invalid_mac(dmac)) {
			client_mac = dmac;
			c = find_client(client_mac);
			if (!c)
				c = add_client(client_mac);
			if (c) {
				c->cur_dl += bytes;
				c->last_seen = time(NULL);
			}
		}
	}

	rewind(fp);

	while (fgets(line, sizeof(line), fp)) {
		if (parse_hnat_line(line, smac, dmac, &bytes, ip, nsip) < 0)
			continue;
		if (bytes == 0)
			continue;

		if (is_router_mac(smac) && is_router_mac(dmac)) {
			if (nsip[0]) {
				client_mac = lookup_mac_by_ip(nsip);
				if (!client_mac && ip[0])
					client_mac = lookup_mac_by_ip(ip);
				if (client_mac && !is_invalid_mac(client_mac)) {
					c = find_client(client_mac);
					if (!c)
						c = add_client(client_mac);
					if (c) {
						c->cur_ul += bytes;
						c->last_seen = time(NULL);
					}
				}
			}
		}
	}

	fclose(fp);

	for (i = 0; i < num_clients; i++) {
		if (!clients[i].ip[0]) {
			lan_ip = lookup_ip_by_mac(clients[i].mac);
			if (lan_ip)
				snprintf(clients[i].ip, sizeof(clients[i].ip), "%s", lan_ip);
		}
	}
}

static int client_cmp(const void *a, const void *b)
{
	const struct client_state *ca = a, *cb = b;
	uint64_t ta = ca->cum_dl + ca->cum_ul;
	uint64_t tb = cb->cum_dl + cb->cum_ul;
	if (ta < tb) return 1;
	if (ta > tb) return -1;
	return 0;
}

static void ensure_db_dir(void)
{
	struct stat st;
	if (stat(DB_DIR, &st) != 0)
		mkdir(DB_DIR, 0755);
}

static void archive_daily(const char *csv_path)
{
	char date_dir[256], archive_path[320], year_dir[256];
	struct stat st;
	time_t now = time(NULL);
	struct tm *tm_info = localtime(&now);
	char buf[MAX_LINE];
	FILE *src, *dst;

	snprintf(year_dir, sizeof(year_dir), DB_DIR "/%04d",
		 tm_info->tm_year + 1900);
	mkdir(year_dir, 0755);

	snprintf(date_dir, sizeof(date_dir), DB_DIR "/%04d/%02d",
		 tm_info->tm_year + 1900, tm_info->tm_mon + 1);
	mkdir(date_dir, 0755);

	snprintf(archive_path, sizeof(archive_path),
		 "%s/usage-%04d-%02d-%02d.db",
		 date_dir, tm_info->tm_year + 1900,
		 tm_info->tm_mon + 1, tm_info->tm_mday);

	if (!csv_path || stat(csv_path, &st) != 0 || st.st_size == 0)
		return;

	src = fopen(csv_path, "r");
	if (!src)
		return;

	dst = fopen(archive_path, "w");
	if (dst) {
		while (fgets(buf, sizeof(buf), src))
			fputs(buf, dst);
		fclose(dst);
	}
	fclose(src);
}

static void load_dnsmasq_hostnames(void)
{
	FILE *fp = NULL;
	char line[MAX_LINE], ip[64], name[128];
	char *p;
	struct stat st;
	const char *src_file = NULL;
	const char *files[] = { "/tmp/hosts/dhcp", "/tmp/dnsmasq.hosts", "/etc/hosts", NULL };
	int i;

	for (i = 0; files[i]; i++) {
		if (stat(files[i], &st) == 0) {
			src_file = files[i];
			break;
		}
	}
	if (!src_file)
		return;

	if (hostname_loaded && st.st_mtime <= hostname_mtime)
		return;

	hostname_mtime = st.st_mtime;
	hostname_loaded = 1;
	hostname_cache_count = 0;

	fp = fopen(src_file, "r");
	if (!fp)
		return;

	while (fgets(line, sizeof(line), fp) && hostname_cache_count < 512) {
		ip[0] = '\0';
		name[0] = '\0';

		if (sscanf(line, "%63s %127s", ip, name) >= 2) {
			p = strchr(ip, '#');
			if (p) *p = '\0';
			p = strchr(name, '#');
			if (p) *p = '\0';

			if (ip[0] && name[0] && strcmp(name, "localhost") != 0 &&
			    !strstr(name, "::") && strcmp(ip, "127.0.0.1") != 0) {
				strncpy(hostname_ip_map[hostname_cache_count], ip, 63);
				strncpy(hostname_cache[hostname_cache_count], name, 127);
				hostname_cache_count++;
			}
		}
	}
	fclose(fp);
}

static const char *resolve_hostname(const char *ip)
{
	if (!ip || !ip[0])
		return NULL;
	for (int i = 0; i < hostname_cache_count; i++)
		if (!strcmp(hostname_ip_map[i], ip))
			return hostname_cache[i];
	return NULL;
}

static void write_csv(const char *path)
{
	FILE *fp = fopen(path, "w");
	uint64_t dl_delta, ul_delta;
	struct client_state *c;
	const char *hostname;

	if (!fp) {
		fprintf(stderr, "Cannot write %s: %s\n", path, strerror(errno));
		return;
	}

	load_dnsmasq_hostnames();

	qsort(clients, num_clients, sizeof(struct client_state), client_cmp);

	fprintf(fp, "mac,ip,hostname,download,upload,total_down,total_up,total,first_seen,last_seen\n");

	for (int i = 0; i < num_clients; i++) {
		c = &clients[i];
		if (!c->active || is_invalid_mac(c->mac))
			continue;

		dl_delta = (c->cur_dl >= c->prev_raw_dl) ? (c->cur_dl - c->prev_raw_dl) : c->cur_dl;
		ul_delta = (c->cur_ul >= c->prev_raw_ul) ? (c->cur_ul - c->prev_raw_ul) : c->cur_ul;

		c->cum_dl += dl_delta;
		c->cum_ul += ul_delta;

		hostname = resolve_hostname(c->ip);
		if (!hostname)
			hostname = "-";

		fprintf(fp, "%s,%s,%s,%llu,%llu,%llu,%llu,%llu,%llu,%llu\n",
			c->mac,
			c->ip[0] ? c->ip : "-",
			hostname,
			(unsigned long long)dl_delta,
			(unsigned long long)ul_delta,
			(unsigned long long)c->cum_dl,
			(unsigned long long)c->cum_ul,
			(unsigned long long)(c->cum_dl + c->cum_ul),
			(unsigned long long)c->first_seen,
			(unsigned long long)c->last_seen);
	}

	fclose(fp);

	archive_daily(path);
}

static void usage(const char *prog)
{
	fprintf(stderr, "Usage: %s [-4|-6] -f <output_file>\n", prog);
	fprintf(stderr, "       %s -l <MAC>\n", prog);
	fprintf(stderr, "  -4      IPv4 only (default: both)\n");
	fprintf(stderr, "  -6      IPv6 only\n");
	fprintf(stderr, "  -f FILE Output CSV file path\n");
	fprintf(stderr, "  -l MAC  List per-flow details for a client\n");
	exit(1);
}

int main(int argc, char *argv[])
{
	char db_path[256] = {};
	char list_mac[18] = {};
	int opt, list_mode = 0;

	while ((opt = getopt(argc, argv, "46f:l:h")) != -1) {
		switch (opt) {
		case '4':
		case '6':
			break;
		case 'f':
			strncpy(db_path, optarg, sizeof(db_path) - 1);
			break;
		case 'l':
			strncpy(list_mac, optarg, sizeof(list_mac) - 1);
			list_mode = 1;
			break;
		default:
			usage(argv[0]);
		}
	}

	if (list_mode && list_mac[0]) {
		list_flows_for_mac(list_mac);
		return 0;
	}

	if (!db_path[0])
		usage(argv[0]);

	read_wan_mac();
	ensure_db_dir();
	load_state();
	scan_foe_table();
	write_csv(db_path);
	save_state();

	return 0;
}
