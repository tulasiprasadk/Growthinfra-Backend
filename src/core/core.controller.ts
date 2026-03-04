import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';
import { CreateOrgDto } from '../dto/create-org.dto';

@Controller('core')
export class CoreController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-insights')
  async generate(@Body() body: CreateOrgDto) {
    const { name, description, category } = body;
    return this.aiService.generateInsights({
      name,
      description,
      category,
    });
  }

  @Post('generate-reel')
  async generateReel(
    @Body()
    body: {
      prompt?: string;
      imageUrl?: string;
      durationSeconds?: number;
    },
  ) {
    const prompt = String(body?.prompt || '').trim();
    if (!prompt) {
      return { success: false, error: 'prompt is required' };
    }
    const durationSeconds = Number.isFinite(Number(body?.durationSeconds))
      ? Number(body?.durationSeconds)
      : 18;

    const result = await this.aiService.generateReels(
      prompt,
      1,
      durationSeconds,
      body?.imageUrl ? String(body.imageUrl) : undefined,
    );

    const reels = Array.isArray(result?.reels) ? result.reels.filter(Boolean) : [];
    if (!reels.length) {
      return {
        success: false,
        error: result?.error || 'Real video generation failed',
        reels: [],
      };
    }

    return {
      success: true,
      url: reels[0],
      reels,
      raw: result?.raw || null,
    };
  }
}
