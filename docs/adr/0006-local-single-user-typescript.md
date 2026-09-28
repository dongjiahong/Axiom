# 本地单用户 Web 应用：全栈 TypeScript + SQLite + 单个 OpenAI 兼容模型

Axiom 以 Next.js 全栈 TypeScript 实现，在本机运行并通过浏览器访问，数据存本地 SQLite，无账号系统；AI 只配置一个 OpenAI 兼容端点（Base URL、API Key、模型名），抽取、角色扮演、评判共用；全部内容（界面、方法论、场景、对话）只用中文。原因：书籍与对话都是私人内容，个人练习工具不需要多用户；TypeScript 单语言足以覆盖 epub / PDF 解析，也可参考同栈的 SocialCoach。由于兼容端点不一定支持 json_schema，所有结构化输出都走"提示词约束 + 解析校验 + 失败重试"的通路，而不依赖端点特性。
