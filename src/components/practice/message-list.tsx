import type { SessionMessageDto } from "@/server/dto/session";

/** 对话气泡：对方在左，用户在右。 */
export function MessageBubble({
  message,
  counterpartName,
}: {
  message: SessionMessageDto;
  counterpartName: string;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[88%] space-y-1 md:max-w-[80%]">
        <div className={`text-muted-foreground text-xs ${isUser ? "text-right" : ""}`}>
          {isUser ? "你" : counterpartName}
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
