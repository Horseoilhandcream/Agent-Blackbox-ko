export type Locale = "en" | "ko";

type Copy = Record<string, string>;

const en: Copy = {
  language: "한국어",
  selectRun: "Select run",
  latestRun: "Latest run (auto)",
  events: "events",
  handoff: "Handoff",
  handoffSummary: "Handoff summary",
  copyMarkdown: "Copy markdown",
  copied: "Copied",
  close: "Close",
  agents: "Agents",
  noAgentLanes: "No agent lanes yet.",
  sessionMap: "Session Map",
  contextEfficiency: "Context efficiency",
  files: "Files",
  replayTimeline: "Replay timeline",
  goLive: "Go live",
  live: "Live",
  replaySequence: "Replay sequence",
  optimize: "Optimize future runs",
  generateAdvice: "Generate advice",
  customChecks: "Custom checks",
  tokens: "tokens",
  input: "input",
  output: "output",
  reasoning: "reasoning",
  cacheRead: "cache read",
  cacheWrite: "cache write",
  lightMode: "Light mode",
  darkMode: "Dark mode",
  switchLight: "Switch to light theme",
  switchDark: "Switch to dark theme",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  resetZoom: "Reset zoom",
  tracing: "Tracing",
  autoLayout: "Auto layout"
};

const ko: Copy = {
  language: "English",
  selectRun: "실행 선택",
  latestRun: "최근 실행 (자동)",
  events: "이벤트",
  handoff: "인계",
  handoffSummary: "작업 인계 요약",
  copyMarkdown: "마크다운 복사",
  copied: "복사됨",
  close: "닫기",
  agents: "에이전트",
  noAgentLanes: "아직 에이전트 작업줄이 없습니다.",
  sessionMap: "세션 맵",
  contextEfficiency: "컨텍스트 효율",
  files: "파일",
  replayTimeline: "재생 타임라인",
  goLive: "실시간으로 이동",
  live: "실시간",
  replaySequence: "재생 시점",
  optimize: "다음 작업 최적화",
  generateAdvice: "개선안 생성",
  customChecks: "사용자 검사 규칙",
  tokens: "토큰",
  input: "입력",
  output: "출력",
  reasoning: "추론",
  cacheRead: "캐시 읽기",
  cacheWrite: "캐시 쓰기",
  lightMode: "라이트 모드",
  darkMode: "다크 모드",
  switchLight: "라이트 모드로 전환",
  switchDark: "다크 모드로 전환",
  zoomOut: "축소",
  zoomIn: "확대",
  resetZoom: "확대 비율 초기화",
  tracing: "최신 흐름 추적",
  autoLayout: "자동 배치"
};

export function text(locale: Locale, key: string): string {
  return (locale === "ko" ? ko : en)[key] ?? key;
}

const metricLabels: Record<string, string> = {
  "Context pressure": "컨텍스트 압력",
  "Cache hit ratio": "캐시 적중률",
  "Redundant re-reads": "중복 재읽기",
  "Read amplification": "읽기 증폭",
  "Large context injections": "대형 컨텍스트 주입",
  "Retry waste": "재시도 낭비",
  "Yield density": "토큰당 산출량",
  "Tool overhead": "도구 호출 부담",
  "Edit churn": "수정 반복",
  "Large file reads": "대용량 파일 읽기",
  "Unused reads": "미사용 읽기"
};

export function localizeMetricLabel(value: string, locale: Locale): string {
  return locale === "ko" ? metricLabels[value] ?? value : value;
}

export function localizeObservedText(value: string, locale: Locale): string {
  if (locale !== "ko") return value;
  const exact: Record<string, string> = {
    "Prompt received": "프롬프트 수신",
    "Started a session": "세션 시작",
    "Started an agent lane": "에이전트 작업줄 시작",
    "Started a parallel session": "병렬 세션 시작",
    "Context compacted": "컨텍스트 압축",
    "Recorded a commit": "커밋 기록",
    "Pushed changes": "변경사항 푸시",
    "Prepared a handoff": "인계 준비",
    "Made a decision": "의사결정 기록",
    "Updated the task list": "작업 목록 갱신",
    "Resolved a permission request": "권한 요청 처리",
    "No waste detected — this run used its context economically.": "낭비가 감지되지 않았습니다. 이번 실행은 컨텍스트를 효율적으로 사용했습니다."
  };
  if (exact[value]) return exact[value];
  return value
    .replace(/^Local task/, "로컬 작업")
    .replace(/^File inspection/, "파일 점검")
    .replace(/^Git review/, "Git 점검")
    .replace(/^Read (.+)$/, "파일 읽기: $1")
    .replace(/^Changed (.+)$/, "파일 수정: $1")
    .replace(/^Created (.+)$/, "파일 생성: $1")
    .replace(/^Deleted (.+)$/, "파일 삭제: $1")
    .replace(/^Used (.+)$/, "도구 사용: $1")
    .replace(/^Ran (.+)$/, "실행: $1")
    .replace(/^Switched to (.+)$/, "에이전트 전환: $1")
    .replace(/^Switched model to (.+)$/, "모델 전환: $1")
    .replace(/^(.+) passed$/, "$1 통과")
    .replace(/^(.+) failed$/, "$1 실패");
}
