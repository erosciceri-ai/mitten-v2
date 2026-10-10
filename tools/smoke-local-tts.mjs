const { generateTTS } = await import('../apps/api/src/services/tts.ts');
const result = await generateTTS({ text: 'Hola, esta es una prueba de voz de MITTEN.' });
process.stdout.write(`TTS ${result.provider} válido: ${result.audio.length} bytes MP3.\n`);
