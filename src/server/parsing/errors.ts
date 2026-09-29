/**
 * 解析阶段的错误：message 是可直接展示给用户的中文，
 * 由 service 映射为 400 invalid_input。
 */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}
