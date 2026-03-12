import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './core/ai.service';
import { searchUnsplashImages } from './utils/unsplash.util';
import { getFallbackShortReels, searchYouTubeShortVideos } from './utils/youtube.util';

type SearchContext = {
  brandName?: string;
  tagline?: string;
  website?: string;
  email?: string;
  contact?: string;
  description?: string;
  imagePrompt?: string;
  launchContext?: string;
  audience?: string;
  videoDurationSeconds?: number;
};

@Controller('search')
export class SearchController {
  constructor(private readonly aiService: AiService) {}

  private extractKeywords(value: string, max = 6): string[] {
    const stop = new Set([
      'most', 'local', 'businesses', 'business', 'because', 'customers', 'cannot', 'discover',
      'easily', 'fragmented', 'digital', 'environments', 'provides', 'that', 'this', 'with',
      'from', 'your', 'about', 'best', 'top', 'for', 'and', 'the', 'are', 'you', 'our', 'now',
      'new', 'launch', 'launched', 'service', 'services', 'solution', 'solutions',
      'them', 'struggle', 'com', 'www',
    ]);

    return String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter((word) => word.length > 2 && !stop.has(word))
      .filter((word, index, all) => all.indexOf(word) === index)
      .slice(0, max);
  }

  private sanitizeCaption(text: string, normalizedQuery: string, brandName: string, description: string, website: string, contact: string, email: string) {
    let cleaned = String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\b(text|reason|insights|message|content):\s*/gi, '')
      .replace(/[\[\]{}"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedClean = cleaned.toLowerCase();
    const normalizedPrompt = normalizedQuery.toLowerCase().trim();
    if (!cleaned || normalizedClean === normalizedPrompt || normalizedClean.startsWith(`${normalizedPrompt}.`)) {
      const brand = brandName || 'our brand';
      const offer = description || 'a stronger service experience';
      const cta = website
        ? `Explore more at ${website}.`
        : contact
          ? `Contact us on ${contact}.`
          : email
            ? `Write to us at ${email}.`
            : 'Get in touch to learn more.';
      cleaned = `${brand} is making it easier for customers to access ${offer}. We built this to deliver a smoother, more valuable experience from the start. ${cta}`;
    }

    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.slice(0, 3).join(' ').trim();
  }

  private buildFallbackInsights(
    normalizedQuery: string,
    desiredCount: number,
    context: Required<Pick<SearchContext, 'brandName' | 'tagline' | 'website' | 'email' | 'contact' | 'description' | 'launchContext' | 'audience'>>,
  ) {
    const brand = context.brandName || 'our brand';
    const offer = context.description || 'a stronger and more reliable customer experience';
    const contextLine = context.launchContext || 'now available for customers who want an easier way to get started';
    const audienceLine = context.audience ? `Built for ${context.audience}.` : '';
    const cta = context.website
      ? `Explore more at ${context.website}.`
      : context.contact
        ? `Call ${context.contact} to get started.`
        : context.email
          ? `Write to ${context.email} to learn more.`
          : 'Get in touch to learn more.';

    const queryLower = normalizedQuery.toLowerCase();
    const launchHook = /\blaunch|launched|new|introduc|subscription|membership|plan\b/.test(queryLower)
      ? `We are excited to introduce a new chapter at ${brand}.`
      : `${brand} is ready to help customers move faster and with more confidence.`;

    const templates = [
      {
        text: `${launchHook} ${offer}. ${contextLine}. ${audienceLine} ${cta}`.replace(/\s{2,}/g, ' ').trim(),
        reason: 'Brand-first caption with a concrete offer and CTA',
      },
      {
        text: `${brand} now makes it easier to access ${offer}. We created this to remove friction, improve consistency, and give customers a smoother experience from day one. ${cta}`.replace(/\s{2,}/g, ' ').trim(),
        reason: 'Benefit-led caption focused on customer outcome',
      },
      {
        text: `If you have been waiting for a simpler way to work with ${brand}, this is it. ${offer}. ${audienceLine} ${cta}`.replace(/\s{2,}/g, ' ').trim(),
        reason: 'Direct response style caption with a clean close',
      },
    ];

    return templates.slice(0, Math.max(1, desiredCount));
  }

  private generateHashtags(normalizedQuery: string, brandName: string, description: string, audience: string, launchContext: string) {
    const hashtags: string[] = [];
    const lowerQuery = normalizedQuery.toLowerCase();
    const lowerDesc = description.toLowerCase();
    const lowerAudience = audience.toLowerCase();
    const lowerLaunch = launchContext.toLowerCase();

    const stopwords = new Set([
      'with', 'from', 'that', 'have', 'your', 'about', 'best', 'top', 'this', 'for',
      'and', 'the', 'are', 'you', 'our', 'new', 'now', 'live', 'launch', 'launching',
      'product', 'service', 'services', 'consulting', 'consultancy', 'business', 'brand',
      'most', 'local', 'because', 'customers', 'cannot', 'easily', 'provides',
    ]);

    const toHashtag = (value: string) => {
      const cleaned = value.replace(/[^a-z0-9\s]/gi, ' ').trim();
      if (!cleaned) return '';
      const parts = cleaned.split(/\s+/).filter(Boolean);
      const tag = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
      return tag.length > 2 ? `#${tag}` : '';
    };

    const pushTag = (tag: string) => {
      if (tag && !hashtags.includes(tag)) hashtags.push(tag);
    };

    if (brandName) pushTag(toHashtag(brandName));

    const keywords = this.extractKeywords(`${description} ${audience} ${normalizedQuery}`, 6).filter((word) => !stopwords.has(word));
    keywords.forEach((word) => pushTag(toHashtag(word)));

    const industryMap: Record<string, string[]> = {
      ecommerce: ['#ECommerce', '#OnlineShopping', '#ShopOnline'],
      food: ['#FoodDelivery', '#FoodieLife', '#EatLocal'],
      restaurant: ['#RestaurantLife', '#DineIn', '#LocalFood'],
      grocery: ['#GroceryDeals', '#FreshProduce', '#FarmFresh'],
      health: ['#Wellness', '#HealthyLiving', '#HealthFirst'],
      fitness: ['#FitnessGoals', '#FitLife', '#GymLife'],
      beauty: ['#BeautyTips', '#SelfCare', '#GlowUp'],
      fashion: ['#FashionTrends', '#StyleInspo', '#OOTD'],
      service: ['#TrustedService', '#CustomerFirst', '#ServicePros'],
      business: ['#SmallBusiness', '#BusinessGrowth', '#Entrepreneur'],
    };

    for (const [keyword, tags] of Object.entries(industryMap)) {
      if (lowerDesc.includes(keyword) || lowerQuery.includes(keyword)) {
        tags.forEach((tag) => pushTag(tag));
        break;
      }
    }

    if (lowerQuery.includes('launch') || lowerLaunch.includes('launch') || lowerQuery.includes('new')) {
      ['#NewLaunch', '#NowLive', '#LaunchDay'].forEach((tag) => pushTag(tag));
    }

    return hashtags.slice(0, 10).join(' ');
  }

  @Post()
  async search(@Body() body: { query?: string; context?: SearchContext }) {
    const query = String(body?.query || '').trim();
    const normalizedQuery = query || 'your campaign topic';
    const context = body?.context || {};

    const brandName = String(context.brandName || '').trim();
    const tagline = String(context.tagline || '').trim();
    const website = String(context.website || '').trim();
    const email = String(context.email || '').trim();
    const contact = String(context.contact || '').trim();
    const description = String(context.description || '').trim();
    const imagePrompt = String(context.imagePrompt || '').trim();
    const launchContext = String(context.launchContext || '').trim();
    const audience = String(context.audience || '').trim();

    const match = normalizedQuery.match(/\btop\s+(\d+)|\b(\d+)\s+(benefits|reasons|ideas|tips)\b/i);
    const desiredCount = match ? Number(match[1] || match[2]) || 3 : 3;

    const primaryTopicSource = [description, imagePrompt, normalizedQuery].find((value) => String(value || '').trim().length > 0) || normalizedQuery;
    const detectedKeywords = this.extractKeywords(primaryTopicSource, 8);
    const topicLabel = detectedKeywords.slice(0, 4).join(' ') || normalizedQuery;
    const combinedContext = [normalizedQuery, description, imagePrompt, launchContext, audience].filter(Boolean).join(' ');

    const aiResult = await this.aiService.generateInsights({
      name: brandName || normalizedQuery,
      description: [
        `Create a polished social media caption for ${brandName || normalizedQuery}.`,
        `Topic: ${normalizedQuery}.`,
        description ? `Offer: ${description}.` : '',
        tagline ? `Tagline: ${tagline}.` : '',
        launchContext ? `Context: ${launchContext}.` : '',
        audience ? `Audience: ${audience}.` : '',
        website ? `Website: ${website}.` : '',
        contact ? `Contact: ${contact}.` : '',
        email ? `Email: ${email}.` : '',
        '',
        'Return a JSON array of objects with "text" and "reason".',
        'Each caption should feel original, concise, and specific.',
        'Do not copy the prompt back.',
        'Do not include hashtags inside the caption.',
      ].filter(Boolean).join('\n'),
      category: 'search',
    });

    let insights: string[] = [];
    if (Array.isArray(aiResult?.insights)) {
      insights = aiResult.insights.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).filter(Boolean);
    } else if (typeof aiResult?.insights === 'string') {
      insights = [aiResult.insights];
    }

    if (!insights.length) {
      insights = this.buildFallbackInsights(normalizedQuery, desiredCount, {
        brandName,
        tagline,
        website,
        email,
        contact,
        description,
        launchContext,
        audience,
      }).map((item) => JSON.stringify(item));
    }

    const normalizedInsights = insights.map((insight) => {
      try {
        const parsed = typeof insight === 'string' ? JSON.parse(insight) : insight;
        const rawText = typeof parsed?.text === 'string' ? parsed.text : String(parsed || '');
        return JSON.stringify({
          text: this.sanitizeCaption(rawText, normalizedQuery, brandName, description, website, contact, email),
          reason: parsed?.reason || 'Relevant branded caption',
        });
      } catch {
        return JSON.stringify({
          text: this.sanitizeCaption(String(insight), normalizedQuery, brandName, description, website, contact, email),
          reason: 'Relevant branded caption',
        });
      }
    });

    let shortResult = '';
    const firstInsight = normalizedInsights[0];
    if (firstInsight) {
      try {
        const parsed = JSON.parse(firstInsight);
        shortResult = parsed?.text || '';
      } catch {
        shortResult = '';
      }
    }

    let images: string[] = [];
    const imageQueryParts = [];
    if (imagePrompt) {
      imageQueryParts.push(imagePrompt);
    } else {
      if (brandName) imageQueryParts.push(brandName);
      imageQueryParts.push(topicLabel);
      const lowerCombined = combinedContext.toLowerCase();
      if (lowerCombined.includes('seo') || lowerCombined.includes('visibility') || lowerCombined.includes('marketing')) {
        imageQueryParts.push('local business marketing analytics');
      } else if (lowerCombined.includes('clinic') || lowerCombined.includes('health') || lowerCombined.includes('medical')) {
        imageQueryParts.push('modern healthcare consultation');
      } else if (lowerCombined.includes('food') || lowerCombined.includes('restaurant') || lowerCombined.includes('grocery') || lowerCombined.includes('delivery')) {
        imageQueryParts.push('fresh produce store delivery');
      } else if (description) {
        imageQueryParts.push(description);
      }
    }
    const imageQuery = imageQueryParts.join(' ').replace(/\s{2,}/g, ' ').trim() || topicLabel;

    try {
      if (this.aiService.isLlmEnabled) {
        const generated = await this.aiService.generateImages(imageQuery, 3);
        if (Array.isArray(generated?.images) && generated.images.length) {
          images = generated.images;
        }
      }
      if (!images.length) {
        images = await searchUnsplashImages(imageQuery, 3);
      }
    } catch (e) {
      console.warn('Image search failed:', e);
      images = [];
    }

    let reels: string[] = [];
    let videoPlan: any = null;
    let videoStatus = 'no_video_provider_result';
    const requestedVideoDuration = Number.isFinite(Number(context?.videoDurationSeconds))
      ? Math.min(20, Math.max(15, Math.round(Number(context?.videoDurationSeconds))))
      : 18;

    try {
      if (this.aiService.isLlmEnabled) {
        const reelResult = await this.aiService.generateReels(normalizedQuery, 1, requestedVideoDuration);
        if (Array.isArray(reelResult?.reels) && reelResult.reels.length) {
          reels = reelResult.reels;
          videoStatus = 'ai_video_generated';
        }
      }
    } catch (e) {
      console.warn('AI reel generation failed:', e);
      videoStatus = 'ai_video_failed';
    }

    if (!reels.length) {
      try {
        const videoQuery = [brandName, topicLabel, description].filter(Boolean).join(' ');
        reels = await searchYouTubeShortVideos(videoQuery, 15, 20, 2);
        if (reels.length) videoStatus = 'youtube_short_video_found';
      } catch (e) {
        console.warn('YouTube short-video search failed:', e);
        videoStatus = 'youtube_search_failed';
      }
    }

    if (!reels.length) {
      reels = getFallbackShortReels(2);
      if (reels.length) videoStatus = 'fallback_demo_video';
    }

    if (!reels.length) {
      const subject = brandName || normalizedQuery;
      const contactLine = [website, email, contact].filter(Boolean).join(' | ');
      videoPlan = {
        durationSeconds: requestedVideoDuration,
        format: 'Vertical 9:16',
        script: [
          `Scene 1 (0-4s): Brand reveal for ${subject}`,
          `Scene 2 (4-10s): Show the core offer and one differentiator`,
          'Scene 3 (10-15s): Show the customer outcome or benefit',
          `Scene 4 (${Math.max(15, requestedVideoDuration - 3)}-${requestedVideoDuration}s): CTA and contact close`,
        ],
        notes: contactLine ? `Use this contact line on the final frame: ${contactLine}` : 'Add a direct CTA on the last frame.',
      };
    }

    const hashtags = this.generateHashtags(normalizedQuery, brandName, description, audience, launchContext);

    return {
      result: shortResult,
      insights: normalizedInsights,
      reels,
      videoStatus,
      videoPlan,
      images,
      hashtags,
      raw: aiResult,
    };
  }
}
