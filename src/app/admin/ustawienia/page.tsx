import { getFreeQuestionsLimit, getSystemPrompt } from "@/lib/settings";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import SettingsForm from "@/components/admin/SettingsForm";

export default async function AdminSettingsPage() {
  const [systemPrompt, freeQuestionsLimit] = await Promise.all([
    getSystemPrompt(),
    getFreeQuestionsLimit(),
  ]);

  return (
    <SettingsForm
      initialSystemPrompt={systemPrompt}
      initialFreeQuestionsLimit={freeQuestionsLimit}
      defaultSystemPrompt={DEFAULT_SYSTEM_PROMPT}
    />
  );
}
