import { getAiDocsMode, getFreeQuestionsLimit, getSystemPrompt } from "@/lib/settings";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import SettingsForm from "@/components/admin/SettingsForm";

export default async function AdminSettingsPage() {
  const [systemPrompt, freeQuestionsLimit, aiDocsMode] = await Promise.all([
    getSystemPrompt(),
    getFreeQuestionsLimit(),
    getAiDocsMode(),
  ]);

  return (
    <SettingsForm
      initialSystemPrompt={systemPrompt}
      initialFreeQuestionsLimit={freeQuestionsLimit}
      initialAiDocsMode={aiDocsMode}
      defaultSystemPrompt={DEFAULT_SYSTEM_PROMPT}
    />
  );
}
