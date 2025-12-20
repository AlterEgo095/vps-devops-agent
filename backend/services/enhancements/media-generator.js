import OpenAI from 'openai';

let openaiClient = null;

function initOpenAI() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

/**
 * Generate image with DALL-E
 */
export async function generateImage(prompt, options = {}) {
  const client = initOpenAI();
  
  if (!client) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const {
    model = 'dall-e-3',
    size = '1024x1024',
    quality = 'standard',
    n = 1
  } = options;

  try {
    const response = await client.images.generate({
      model,
      prompt,
      n,
      size,
      quality,
      response_format: 'url'
    });

    return {
      success: true,
      images: response.data.map(img => ({
        url: img.url,
        revisedPrompt: img.revised_prompt
      })),
      metadata: {
        model,
        size,
        quality,
        prompt
      }
    };

  } catch (error) {
    console.error('Image generation error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

/**
 * Generate audio with TTS
 */
export async function generateAudio(text, options = {}) {
  const client = initOpenAI();
  
  if (!client) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const {
    model = 'tts-1',
    voice = 'alloy',
    speed = 1.0
  } = options;

  try {
    const response = await client.audio.speech.create({
      model,
      voice,
      input: text,
      speed,
      response_format: 'mp3'
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      success: true,
      audio: buffer,
      metadata: {
        model,
        voice,
        speed,
        format: 'mp3',
        size: buffer.length,
        textLength: text.length
      }
    };

  } catch (error) {
    console.error('Audio generation error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

/**
 * Generate image variation
 */
export async function generateImageVariation(imageBuffer, options = {}) {
  const client = initOpenAI();
  
  if (!client) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const {
    n = 1,
    size = '1024x1024'
  } = options;

  try {
    const response = await client.images.createVariation({
      image: imageBuffer,
      n,
      size,
      response_format: 'url'
    });

    return {
      success: true,
      images: response.data.map(img => ({ url: img.url })),
      metadata: { n, size }
    };

  } catch (error) {
    console.error('Image variation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get available TTS voices
 */
export function getAvailableVoices() {
  return [
    { id: 'alloy', description: 'Neutral and balanced voice' },
    { id: 'echo', description: 'Calm masculine voice' },
    { id: 'fable', description: 'Expressive British voice' },
    { id: 'onyx', description: 'Deep masculine voice' },
    { id: 'nova', description: 'Energetic feminine voice' },
    { id: 'shimmer', description: 'Soft feminine voice' }
  ];
}

/**
 * Validate image parameters
 */
export function validateImageParams(options) {
  const validSizes = {
    'dall-e-2': ['256x256', '512x512', '1024x1024'],
    'dall-e-3': ['1024x1024', '1792x1024', '1024x1792']
  };

  const model = options.model || 'dall-e-3';
  const size = options.size || '1024x1024';

  if (!validSizes[model].includes(size)) {
    throw new Error(
      `Size ${size} invalid for ${model}. Valid: ${validSizes[model].join(', ')}`
    );
  }

  return true;
}

export default {
  generateImage,
  generateAudio,
  generateImageVariation,
  getAvailableVoices,
  validateImageParams
};
