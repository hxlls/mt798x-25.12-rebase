# AGENTS.md

## 语言偏好

所有回答默认使用**简体中文**，包括代码解释、技术讨论和错误分析。代码、命令、文件名等技术内容保持原文不变。

## Autonomous Generalist Scientist（医学方向）

### 宽松授权项目（Apache 2.0 / MIT）

| 项目 | 授权 | 方向 | GitHub |
|------|------|------|--------|
| PaperQA2 | Apache 2.0 | 文献问答/RAG，医学文献准确率超人类 | Future-House/paper-qa |
| Agent Laboratory | MIT | 端到端科研流程，多Agent协作 | SamuelSchmidgall/AgentLaboratory |
| AgentRxiv | MIT | Agent之间共享研究成果 | SamuelSchmidgall/AgentLaboratory |
| MONAI | Apache 2.0 | 医学影像AI框架 | Project-MONAI/MONAI |
| BioPython | Apache 2.0 | 生物信息学工具库 | biopython/biopython |
| Scanpy | BSD-3 | 单细胞RNA-seq分析 | scverse/scanpy |

### 医学场景推荐组合

| 场景 | 推荐方案 | 授权 |
|------|---------|------|
| 文献综述/循证医学 | PaperQA2 | Apache 2.0 |
| 药物发现 | PaperQA2 + ChemCrow + RDKit | Apache 2.0 + MIT |
| 临床研究 | Agent Laboratory | MIT |
| 医学影像 | MONAI | Apache 2.0 |
| 基因组学 | BioPython + Scanpy | Apache 2.0 + BSD-3 |
| 端到端科研 | Agent Laboratory | MIT |

### AI Scientist (Sakana) 授权注意

- **非 Apache 2.0**，是自定义 "The AI Scientist Source Code License"
- 禁止：无人监督的医疗诊断、监控用途
- 要求：生成论文必须声明"机器生成"
- 学校/商业可用，但需遵守上述限制

### Apache 2.0 协议要点

- ✅ 商业使用、修改、分发、闭源、专利授权
- 📋 义务：保留版权声明 + 标注修改（文件内加注释即可）
- ❌ 不需要：提交PR、公开源码、回馈原作者
- ❌ 不提供：担保、商标权
