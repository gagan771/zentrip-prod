import { apiFormRequest, apiRequest } from './api-client';

export type TranslationResponse = {
  sourceText: string;
  targetLanguage: string;
  translatedText: string;
  pronunciation: string | null;
  confidence: string;
  mode: string;
  context: { sourceName: string; sourceUrl?: string | null; claim?: string }[];
};

export function translateText(input: { text: string; targetLanguage: string; sourceLanguage?: string }) {
  return apiRequest<TranslationResponse>('/v1/translation/translate', {
    method: 'POST',
    body: { sourceLanguage: 'en', ...input },
  });
}

export function translateSpeech(uri: string, input: { targetLanguage: string; sourceLanguage: string }) {
  const form = new FormData();
  form.append('audio', { uri, name: 'turn.m4a', type: 'audio/m4a' } as unknown as Blob);
  form.append('targetLanguage', input.targetLanguage);
  form.append('sourceLanguage', input.sourceLanguage);
  return apiFormRequest<TranslationResponse>('/v1/translation/speech', form);
}

export function translatePhoto(uri: string, input: { targetLanguage: string }) {
  const form = new FormData();
  form.append('photo', { uri, name: 'menu.jpg', type: 'image/jpeg' } as unknown as Blob);
  form.append('targetLanguage', input.targetLanguage);
  form.append('sourceLanguage', 'auto');
  return apiFormRequest<TranslationResponse>('/v1/translation/ocr', form);
}
