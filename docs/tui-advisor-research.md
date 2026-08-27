# OMP TUI Advisor 캐릭터 위젯 리서치

## 문서 목적

이 문서는 `omp-advisor-companion`가 OMP 18.0.7의 실행 중인 TUI 안에서 Advisor 캐릭터와 최신 조언을 표시하는 최종 구조를 기록한다. 데스크톱 Codex 클라이언트 방향은 [`research.md`](./research.md)에 별도로 정리되어 있다.

## 최종 결정

1. OMP의 기존 Advisor 런타임과 `input`, `message_start`, `message_end`, session lifecycle 이벤트를 그대로 사용한다.
2. `message_start`에서 기본 Advisor custom message의 `display`를 꺼서 원본 transcript 카드를 숨긴다. `message_end`에서는 같은 note를 위젯에 반영한다.
3. 캐릭터는 배포된 정적 `assets/advisor.png` 한 장이다.
4. 확장은 유효한 Advisor 메시지가 도착했을 때만 `ctx.ui.setWidget("omp-advisor-companion", factory, { placement: "aboveEditor" })`로 하나의 비모달 위젯을 등록한다. OMP 18.0.7의 `WidgetPlacement`는 `aboveEditor`와 `belowEditor`만 제공하므로 true right dock이나 editor 폭 예약을 제공하지 않는다.
5. 위젯은 host 폭이 충분하면 이미지와 말풍선을 나란히, 좁으면 이미지를 먼저 말풍선 위에 세로로 렌더링한다. Direct Kitty 제어행은 정렬용 공백을 앞에 붙이지 않고 `renderedImage`와 byte-for-byte 동일한 하나의 연속된 이미지 블록으로 말풍선 앞에 유지한다. 일반 rows는 host 폭 이내다.
6. `@oh-my-pi/pi-tui`의 `Image`와 호스트의 live `tui.imageBudget`를 사용한다.
7. Ghostty split companion 구조는 채택하지 않는다. AppleScript, 별도 프로세스, Unix socket, IPC protocol, focus automation은 최종 구현에 없다.
8. Live2D, 영상, sprite animation, 주기적 프레임 갱신은 범위에서 제외한다.

## OMP Advisor 재사용

OMP에는 reviewer model 기반 Advisor가 이미 있다.

- `/advisor on`, `/advisor off`, `/advisor status`
- primary transcript delta 검토
- 기본 조사 도구 `read`, `grep`, `glob`
- `nit`, `concern`, `blocker` severity
- advisor별 transcript와 usage 기록
- primary session으로 concise advice 전달

플러그인은 Advisor 모델을 새로 실행하지 않는다. `message_start`에서 기본 transcript 표시를 끄고, `message_end`에서 같은 custom message를 검증해 위젯에 반영한다.

```ts
interface AdvisorMessage {
  role: "custom";
  customType: "advisor";
  display: true; // message_start에서 false로 바꿔 기본 transcript 카드 숨김
  details: {
    notes: Array<{
      note: string;
      severity?: "nit" | "concern" | "blocker";
      advisor?: string;
    }>;
  };
}
```

`src/advisor-events.ts`는 `AdvisorSeverity`와 `AdvisorNote` 타입, 정확한 command parser, malformed entry를 버리는 note extractor를 함께 제공한다.

## 채택하지 않은 대안: Ghostty split companion

초기 조사에서는 별도의 Ghostty right split에 companion TUI를 띄우는 방식을 검토했다. 이 방식은 native pane resize를 얻는 대신 다음 경계를 추가한다.

- AppleScript로 terminal surface를 만들고 focus를 복구해야 한다.
- 확장과 companion 사이에 Unix socket과 JSONL protocol이 필요하다.
- 별도 subprocess의 readiness, crash, 종료, socket cleanup을 관리해야 한다.
- OMP editor와 분리된 surface의 수명 및 오류를 동기화해야 한다.
- Ghostty가 아닌 터미널에서는 같은 기능을 제공할 수 없다.

OMP가 이미 `aboveEditor` widget mount point와 TUI 이미지 컴포넌트를 제공하지만, OMP 18.0.7의 placement는 true right dock이나 editor 폭 예약이 아니다. 따라서 이 복잡성은 이 기능에 필요하지 않다. Ghostty split은 기록된 rejected alternative일 뿐이며, 현재 사용법이나 구현 전제가 아니다. 최종 구현은 어떤 특정 terminal, AppleScript, socket, subprocess에도 의존하지 않는다.

## 최종 위젯 구조

유효한 Advisor note가 도착하면 aboveEditor 위젯을 생성한다.

- 충분한 host 폭: `[image columns] [gap] [bubble columns]`
- 좁은 host 폭: `[image rows]`, 빈 줄, `[bubble rows]`
- Direct Kitty: 이미지 제어행 전체를 정렬용 공백 없이 이미지 블록으로 보존하고 말풍선 앞에 둔다.

`setWidget`은 editor 위에 내용을 배치하지만 focus를 소유하거나 editor를 교체하지 않는다. `WidgetPlacement`가 제공하는 것은 aboveEditor/belowEditor뿐이므로 true right dock이 아니며 editor 폭을 예약하지 않는다. 위젯은 유효한 note가 있을 때만 생성되고, 비모달이며 포커스를 가져가지 않아야 하므로 `ctx.ui.custom`을 통한 custom overlay를 만들지 않는다.

## 상태와 lifecycle

미러 상태는 `boolean | undefined`다.

| 이벤트 | 동작 |
| --- | --- |
| `/advisor on` | `true`로 만들지만 유효한 Advisor 메시지가 도착할 때까지 위젯은 숨김 |
| `/advisor off` | `false`로 만들고 note를 폐기한 뒤 `setWidget(key, undefined)` |
| bare `/advisor` | 상태가 알려진 경우에만 toggle; unknown이면 숨김 유지 |
| `/advisor status` | 변경 없음 |
| valid Advisor message | `false` 상태가 아니면 `true`로 만들고 batch의 마지막 valid note와 이미지·말풍선 그룹을 생성하거나 교체 |
| `session_start` | unknown으로 reset하고 note/widget 제거 |
| `session_before_switch` | note/widget 제거하고 unknown으로 reset |
| `session_shutdown` | note/widget 제거하고 unknown으로 reset |

TUI이고 UI가 있는 context에서만 동작한다. RPC, JSON, print 등 다른 mode는 warning 없는 silent no-op이다. `message_start`는 명시적 off 상태가 아니면 기본 transcript 렌더링 전에 Advisor card의 `display`를 끄고, `message_end`는 명시적 off 상태가 아니면 note를 위젯으로 미러링한다.

새 note는 기존 widget key를 대체하므로 duplicate widget이 생기지 않는다. session cleanup 또는 `/advisor off`가 진행되는 동안 늦게 끝난 이미지 read가 widget을 되살리지 않도록 controller version token을 확인한다.

## 렌더링 계약

`src/panel-view.ts`는 sanitization, ANSI-aware wrapping, header, bubble rendering을 pure helper로 유지하고 `AdvisorPanelView` component를 제공한다.

- note가 없으면 위젯이 없고 image/text도 렌더링하지 않는다.
- note가 있으면 host 폭이 충분할 때 이미지와 말풍선을 나란히 배치하고, 좁은 host에서는 이미지를 먼저 말풍선 위에 쌓는다.
- Direct Kitty 제어행은 정렬용 공백을 앞에 붙이지 않고 `renderedImage`와 byte-for-byte 동일한 하나의 연속 블록으로 말풍선 앞에 유지한다. 일반 rows는 host 폭 이내다.
- image maximum은 20 columns × 14 rows다.
- `bubbleMaxWidth`를 지정하지 않으면 bubble/layout width는 host render width를 사용하고, 지정하면 `20`–`120` columns 범위의 상한으로 적용한다.
- 반환되는 모든 line은 host-provided width 이내다.
- note 내용은 ANSI와 terminal control을 제거한 plain text다.
- severity는 border 색상에만 반영하고 note 내용은 색칠하지 않는다.
- bubble header는 `Advisor` 또는 advisor 이름 없이 `<concern>`처럼 severity 태그만 표시한다.
- note가 바뀌면 component cache를 무효화한다.
- `dispose`는 반복 호출해도 안전하며 stale image cache를 남기지 않는다.
- `process.stdout.rows`를 읽지 않는다. 고정 이미지 한도와 bubble 내용이 widget 높이를 제한한다.

OMP `Image`는 Kitty graphics를 지원하는 terminal에서 live image를 렌더링하고, 지원하지 않는 terminal에서는 자체 text fallback을 사용한다. 확장은 factory가 받는 live `tui.imageBudget`를 Image에 전달한다.

## Asset loading

`assets/advisor.png`는 extension process에서 필요할 때 한 번만 읽고 promise를 memoize한다. PNG signature를 검사한 뒤 base64로 변환한다. read 또는 render 실패는 OMP를 crash시키지 않으며 activation마다 최대 한 번 warning을 보낸다.

자산 계약:

- static RGBA PNG
- `1024 × 1536`, 2:3 portrait
- transparent background
- embedded text와 speech bubble 없음
- 배포 권리를 보유한 자산만 포함

## 검증 범위

허용된 focused tests는 다음 동작을 보존한다.

- exact `/advisor` command parsing
- valid/malformed Advisor note extraction
- bubble sanitization
- severity header와 border
- narrow wrapping 및 visible-width invariant
- note가 없는 렌더링과 note가 있는 image-plus-bubble의 line content/line count

Ghostty, IPC, socket, protocol, standalone companion에 대한 테스트는 최종 구조에서 제거한다.
