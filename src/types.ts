export interface Chunk {
  id: string;
  category: string;
  source: string;
  title: string;
  section: string;
  url: string;
  text: string;
  deadline: string | null;
  fetched_at: string;
}

export interface RetrievedChunk extends Chunk {
  score: number;
  refIndex: number;
}

export interface JudgeResult {
  groundedness: number;
  refusal_appropriate: boolean | null;
  unsupported_claims: boolean;
  note: string;
}

export type SourceBadgeKind = 'official' | 'founder' | 'industry';

export function badgeKindFor(source: string): SourceBadgeKind {
  if (source === '후킹포인트') return 'official';
  if (source === '대표확인') return 'founder';
  return 'industry';
}

export const CATEGORIES = ['제작', '기획', '편집', '후반문의', '회사정보'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<string, string> = {
  제작: '제작',
  기획: '기획',
  편집: '편집',
  후반문의: '후반 문의',
  회사정보: '후킹포인트가 궁금해요',
};

export const CATEGORY_HINT: Record<string, string> = {
  제작: '후킹포인트가 지금 준비 중인 제작 라인업이 궁금할 때 물어보세요.',
  기획: 'IP 개발·판권 계약 관련 질문을 물어보세요. 진행 중인 프로젝트 상세는 비공개입니다.',
  편집: '후킹포인트가 편집한 작품에 대해 물어보세요 (감독 · 캐스팅 · 시청처 등)',
  후반문의: '후반작업 전반, VFX 협업, AI 작업 의뢰에 대해 물어보세요.',
  회사정보: '후킹포인트가 어떤 회사인지, 연락처가 궁금할 때 물어보세요.',
};

export const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  제작: ['지금 어떤 작품을 준비하고 있어요?', 'IP 프로젝트는 몇 개나 진행 중이에요?'],
  기획: ['웹툰 원작 영상화 판권 계약은 어떻게 하나요?', 'IP 프로젝트 시놉시스를 볼 수 있나요?'],
  편집: ['메리 베리 러브는 누가 편집했나요?', '편집 의뢰는 어떻게 하나요?'],
  후반문의: ['VFX 협업은 어떻게 진행되나요?', 'AI 작업 의뢰 과정이 궁금해요'],
  회사정보: ['후킹포인트는 어떤 회사인가요?', '연락처가 어떻게 되나요?'],
};

export const PRODUCTION_CONTACT = {
  email: 'hooking.point@gmail.com',
  // TODO: 대표에게 실제 회사 전화번호를 받으면 채워넣기 (tel: 링크 활성화)
  phone: null as string | null,
};

export const CTA_LINKS: Record<string, { label: string; href: string }[]> = {
  제작: [],
  기획: [{ label: 'IP 열람 문의하기', href: 'mailto:hooking.point@gmail.com' }],
  편집: [
    { label: '실제 과정 살펴보기', href: 'https://hookingpoint.example/filmography' },
    { label: '편집 의뢰하기', href: 'mailto:hooking.point@gmail.com' },
  ],
  후반문의: [
    { label: 'AI 작업 의뢰 문의', href: 'mailto:hooking.point@gmail.com' },
    { label: 'VFX 협업 문의', href: 'mailto:hooking.point@gmail.com' },
  ],
  회사정보: [{ label: '회사 소개 더 보기', href: 'https://hookingpoint.example/about' }],
};
