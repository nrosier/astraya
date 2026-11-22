import type { Page } from '@playwright/test';

export declare const CARD_SELECTOR: string;
export declare function measureCards(page: Page): Promise<Record<string, unknown>[]>;
