# Moe Codex 제품 리서치와 기술 방향

## 문서 목적

이 문서는 `omp-advisor-companion`에서 검토했던 초기 캐릭터 중심 Codex 데스크톱 클라이언트 방향과 조사 결과를 기록한다. 참조 화면은 왼쪽 프로젝트 탐색, 중앙 작업·코드·리뷰 영역, 오른쪽 캐릭터 패널, 하단 프롬프트 입력기로 구성된다.

현재 결론은 공식 Codex Desktop을 꾸미는 스킨이 아니라, `codex app-server`를 실행 엔진으로 사용하는 독립 로컬 클라이언트를 만드는 것이다.

## 결정 요약

1. 제품은 `codex app-server` 기반 독립 데스크톱 클라이언트로 만든다.
2. 데스크톱 셸은 Tauri 2, UI는 React와 TypeScript, 로컬 프로세스 제어는 Rust가 담당한다.
3. app-server 연결은 로컬 `stdio` JSONL을 사용하고 WebSocket은 초기 범위에서 제외한다.
4. 공식 CLI가 생성하는 안정 TypeScript 스키마만 사용한다. 실험 API는 초기 범위에서 제외한다.
5. 중앙 영역은 편집 가능한 IDE가 아니라 대화·작업 활동·diff·파일 미리보기로 시작한다.
6. 오른쪽 캐릭터는 평소 조용히 대기한다. 사용자가 `Advisor`를 켰을 때만 별도의 조언을 대사 버블로 보여준다.
7. Live2D 공개 샘플 모델은 로컬 프로토타입에 사용할 수 있다. 저장소나 공개 배포물에 모델 원본을 포함하는 것은 모델별 약관 확인 전까지 금지한다.
8. 공개 제품에는 자체 제작 또는 명시적으로 배포 권리를 확보한 캐릭터 모델을 사용한다.

## 목표와 비목표

### 목표

- 기존 Codex 로그인과 로컬 실행 환경 재사용
- 프로젝트와 thread 탐색
- turn 실행 및 스트리밍 상태 표시
- command, file change, tool call 렌더링
- 승인 요청과 diff 검토
- 캐릭터 기반 Advisor 경험
- 로컬 우선 권한 경계

### 초기 비목표

- VS Code 수준 코드 에디터
- PTY 터미널
- Git stage, commit, worktree UI
- 원격 접속
- 다중 계정
- Live2D 모델 마켓플레이스 또는 임의 모델 로더
- 음성 대화
- 별도 API key 기반 AI 서비스
- Codex Desktop 내부 DOM 또는 `app.asar` 재사용

## 공식 Codex 통합 조사

### app-server의 용도

공식 문서는 `codex app-server`를 인증, 대화 이력, 승인, 스트리밍 이벤트가 필요한 rich client용 인터페이스로 설명한다. CLI나 SDK를 흉내 내는 대신 Codex의 agent loop, sandbox, tool 실행 및 thread 상태를 그대로 사용한다.

- [Codex app-server 공식 문서](https://developers.openai.com/codex/app-server)
- [Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)
- [app-server 소스 문서](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex protocol crate](https://github.com/openai/codex/blob/main/codex-rs/protocol/README.md)

### 전송 방식

| 전송 | 상태 | 초기 채택 여부 |
| --- | --- | --- |
| `stdio://` | 기본값, JSONL | 채택 |
| `unix://` | Unix socket 위 WebSocket | 후속 reconnect/daemon 검토 |
| `ws://` | experimental/unsupported | 비채택 |
| `off` | 로컬 transport 비활성화 | 비채택 |

Tauri Rust host가 `codex app-server` 자식 프로세스를 소유하고 stdin/stdout으로 JSON-RPC 메시지를 교환한다. React renderer에는 shell이나 app-server stdin을 직접 노출하지 않는다.

### 프로토콜 라이프사이클

```text
initialize
  → initialized
  → thread/start | thread/resume
  → turn/start
  → item/started
  → item/*/delta
  → approval request/response
  → item/completed
  → turn/completed
```

- **Thread**: 지속되는 대화. 여러 turn을 가진다.
- **Turn**: 한 번의 사용자 요청과 뒤따르는 에이전트 실행.
- **Item**: 사용자·에이전트 메시지, reasoning, command, file change, tool call 등.

클라이언트는 연결마다 `initialize`와 `initialized` 핸드셰이크를 완료해야 한다. 새 대화는 `thread/start`, 기존 대화는 `thread/resume`, 사용자 입력은 `turn/start`, 실행 중단은 `turn/interrupt`를 사용한다.

### 승인 흐름

app-server는 승인 UI가 필요할 때 클라이언트로 server-initiated JSON-RPC request를 보낸다.

주요 요청:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- `item/tool/requestUserInput`

Rust host는 요청의 JSON-RPC `id`, `threadId`, `turnId`, `itemId`를 보존한다. UI가 결정을 반환하면 같은 요청 `id`에 응답한다. 승인 화면은 단순 알림이 아니라 실행을 막고 있는 상태이므로 현재 turn과 함께 보여줘야 한다.

### 인증 재사용

app-server는 기존 `CODEX_HOME`과 Codex CLI 인증 정보를 사용한다.

주요 메서드:

- `account/read`
- `account/login/start`
- `account/logout`
- `account/rateLimits/read`
- `account/usage/read`

초기 제품은 “Codex CLI 로그인 필요”를 전제한다. 별도 로그인 UI는 이후 필요가 확인될 때 추가한다.

### 스키마와 호환성

설치된 Codex 버전에 정확히 대응하는 TypeScript 타입을 생성할 수 있다.

```bash
codex app-server generate-ts --out ./src/generated/codex
```

기본 출력은 안정 API만 포함한다. `--experimental`은 호환성 보장이 없는 필드와 메서드를 포함하므로 초기 제품에서는 사용하지 않는다.

시작 시 `codex --version`을 검사하고 지원 범위를 벗어나면 명확한 오류를 보여준다. 프로토콜 타입을 수작업으로 복제하지 않는다.

## 관련 오픈소스 비교

프로젝트 인기도는 참고 정보일 뿐 품질 순위가 아니다. 라이선스와 현재 구조를 우선한다.

| 프로젝트 | 구조 | 라이선스 | 활용 판단 |
| --- | --- | --- | --- |
| [Codexia](https://github.com/milisp/codexia) | Tauri 2, React/TS, Rust, app-server | MIT | 최신 Tauri/app-server 계층 참고 1순위. 전체 포크는 기능이 너무 많음 |
| [CodexMonitor](https://github.com/Dimillian/CodexMonitor) | Tauri 2, React, Rust, app-server | MIT | Codex 전용 프로젝트·thread·diff·approval UX 참고 1순위 |
| [Panes](https://github.com/wygoralves/panes) | Tauri 2, Codex/Claude/OpenCode, Git, terminal | MIT | 데스크톱 통합 참고. 초기 범위에는 과도함 |
| [seo-rii/codex-webui](https://github.com/seo-rii/codex-webui) | Rust gateway, Svelte SPA, app-server | MIT | reconnect, 긴 history, queue, 보안 경계 참고 |
| [lezi-fun/codex-webui](https://github.com/lezi-fun/codex-webui) | Bun/JS bridge, app-server stdio, WebSocket UI | MIT | 작은 approval/diff bridge 참고 |
| [0xcaff/codex-web](https://github.com/0xcaff/codex-web) | 브라우저 frontend, app-server | 명시 없음 | 코드 재사용 금지, 사용 사례만 참고 |
| [mxinO/Codex-Web-UI](https://github.com/mxinO/Codex-Web-UI) | Node bridge, app-server, Web UI | 명시 없음 | 코드 재사용 금지, 구조만 참고 |
| [pocodex](https://github.com/davej/pocodex) | Codex webview/app bundle 재사용 및 host shim | Apache-2.0 | 내부 desktop bundle 의존성이 커서 비채택 |
| [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) | 공식 앱 CDP/CSS injection | MIT | 테마 팩과 아트 처리 참고. 제품 기반으로는 비채택 |
| [Codex Dynamic Skin](https://github.com/CCDawn/Codex-Dynamic-Skin) | Dream Skin 파생, 동적 배경 | MIT | 동영상 배경 참고만 가능 |
| [CDX-Theme](https://github.com/croath/CDX-Theme) | Tauri 테마 관리자, CDP | Proprietary | UX 참고만 가능, 코드 재사용 금지 |

### 기존 리서치에서 수정된 사실

- Dream Skin은 조사 시점 `v1.5.16`까지 배포되고 있으며, 단순 실험보다 성숙한 테마 관리 프로젝트다.
- Dynamic Skin은 독립적인 app-server client가 아니라 Dream Skin 계열의 CDP 테마 프로젝트다.
- CDX-Theme은 소스가 공개되어 있어도 proprietary 라이선스다.
- 독립 데스크톱 client 참고 대상으로는 CodexMonitor, Codexia, Panes가 더 직접적이다.
- 공식 arbitrary stylesheet와 decorative theme pack은 아직 [열린 기능 요청](https://github.com/openai/codex/issues/33497)이다.

## 권장 아키텍처

```text
┌──────────────────────────────────────────────────────────┐
│                   Tauri 2 Desktop                         │
│                                                          │
│  ┌──────────────── React / TypeScript ─────────────────┐  │
│  │ Project/Thread │ Activity + Diff │ Character Panel │  │
│  │                │                 │ Advisor Bubble  │  │
│  │                Prompt Composer                     │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │ typed Tauri events/invokes      │
│  ┌──────────────── Rust Host ──────────────────────────┐  │
│  │ Codex process supervisor                           │  │
│  │ JSON-RPC request/response table                    │  │
│  │ Approval routing                                   │  │
│  │ Advisor isolation                                  │  │
│  │ Workspace/native dialog boundary                  │  │
│  └──────────────────────┬─────────────────────────────┘  │
└─────────────────────────│────────────────────────────────┘
                          │ stdio JSONL
                 codex app-server
                          │
                Codex harness / sandbox
```

### Rust host 책임

- `codex` 실행 파일 탐색과 버전 확인
- app-server 프로세스 수명 관리
- JSONL framing과 JSON-RPC request table
- notification을 typed UI event로 변환
- approval request/response 상관관계 유지
- Advisor thread와 일반 작업 thread 격리
- renderer가 호출할 수 있는 명시적 command allowlist

### React UI 책임

- project/thread 선택 상태
- thread/turn/item reducer
- 스트리밍 메시지와 tool activity 렌더링
- diff 및 승인 UI
- prompt composer
- Advisor toggle, 캐릭터와 대사 버블 상태

## Advisor UX 결정

### 핵심 원칙

캐릭터는 상시 말하는 assistant가 아니다. 기본 상태에서는 조용히 대기하고, 사용자가 `Advisor`를 명시적으로 켰을 때만 현재 작업에 대한 보조 조언을 대사 버블로 제공한다.

Advisor는 메인 Codex 에이전트의 말을 캐릭터 말투로 반복하지 않는다. 메인 에이전트가 작업을 수행하고, Advisor는 결과를 읽고 짧은 관찰이나 다음 확인 지점을 제안한다.

### 모드 동작

#### Advisor 꺼짐 — 기본값

- 캐릭터는 idle motion만 재생한다.
- 대사 버블은 숨긴다.
- Advisor용 thread나 turn을 생성하지 않는다.
- 토큰을 사용하지 않는다.
- 완료, 오류, 승인 이벤트를 캐릭터 대사로 자동 변환하지 않는다.

#### Advisor 켜짐

초기 버전에서는 다음 두 경우에만 조언을 요청한다.

1. 사용자가 캐릭터 또는 `조언 요청` 버튼을 직접 누른 경우
2. 메인 turn이 완료된 뒤 자동 조언 옵션이 켜진 경우

command 하나마다 호출하거나 스트리밍 중 계속 호출하지 않는다. 자동 조언은 turn당 최대 한 번이며 새 turn이 시작되면 이전 Advisor 요청을 취소하거나 결과를 폐기한다.

### Advisor 상태 머신

```text
off
  ↕ toggle
idle
  → thinking
  → speaking
  → idle

thinking → cancelled → idle
thinking → failed → idle + 비침투적 오류 표시
```

- `idle`: 캐릭터만 표시, 버블 없음
- `thinking`: 작은 말줄임표 또는 사고 표시
- `speaking`: 대사 버블 표시
- `failed`: 작업 화면을 막지 않고 작은 재시도 affordance만 표시

### 대사 버블 규칙

- 기본 1~3문장
- 첫 버전은 plain text만 허용
- 화면 중앙의 작업 내용이나 승인 버튼을 가리지 않음
- 사용자가 닫을 수 있음
- `prefers-reduced-motion`을 존중
- 일반 조언은 assertive screen reader 알림을 사용하지 않음
- 증거 없이 테스트 성공, 성능 개선, 보안 보장을 주장하지 않음
- 메인 에이전트 답변을 그대로 반복하지 않음

### Advisor 입력 계약

Advisor에는 전체 workspace를 자유롭게 탐색시키기보다 애플리케이션이 만든 제한된 snapshot을 전달한다.

```ts
interface AdvisorSnapshot {
  threadId: string;
  turnId: string;
  userGoal: string;
  finalAgentMessage: string | null;
  changedFiles: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
  checks: Array<{
    name: string;
    status: "passed" | "failed" | "unknown";
    summary: string;
  }>;
  unresolvedApprovals: number;
}
```

민감한 command output, 환경 변수, credential, 전체 파일 내용은 기본 snapshot에 넣지 않는다.

### Advisor 실행 격리

Advisor는 메인 작업 thread에 메시지를 추가하지 않는다. 별도의 ephemeral thread를 사용해 메인 대화 context를 오염시키지 않는다.

초기 안전 경계:

- ephemeral Advisor thread
- read-only sandbox
- network 비활성 또는 승인 필요
- Advisor thread에서 발생한 모든 write/command approval 요청 자동 거부
- 애플리케이션이 제공한 snapshot을 우선 사용
- Advisor off 시 진행 중 요청 취소 및 결과 폐기

app-server 안정 API만으로 tool 사용을 완전히 비활성화할 수 있는지는 구현 spike에서 확인해야 한다. 완전 비활성화가 불가능하면 빈 임시 workspace와 read-only sandbox를 함께 사용한다.

## Live2D 공개 모델 사용 결정

### 결론

공식 공개 샘플 모델을 **로컬 프로토타입과 SDK 통합 검증에 사용하는 것은 가능하다.** 그러나 “무료 공개 모델”이라는 이유만으로 모델 파일을 저장소나 설치 바이너리에 자유롭게 포함할 수 있는 것은 아니다.

공식 자료:

- [Live2D Cubism Sample Data Collection](https://www.live2d.com/en/learn/sample/)
- [Sample Data Terms of Use](https://www.live2d.com/en/learn/sample/model-terms/)
- [Free Material License Agreement](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)
- [SDK Release License](https://www.live2d.com/en/sdk/license/)
- [Expandable Applications](https://www.live2d.com/en/sdk/license/expandable/)

### 프로토타입 모델 후보

`Hiyori Momose` 같은 Live2D original sample character를 로컬 개발 자산으로 사용할 수 있다. 다만 Hiyori는 공식 개별 조건에 따라 디자인 변경이 허용되지 않는다. 캐릭터별 조건이 다르므로 다른 모델로 교체할 때도 개별 약관을 다시 확인한다.

SDK 렌더링 파이프라인만 먼저 확인하려면 공식 `Simple model`이 더 작은 기술 검증 대상이다.

### 저장소 정책

공식 Free Material License는 명시적으로 허용된 경우를 제외하고 Material 자체의 재배포를 금지한다. 따라서 약관 검토가 끝나기 전까지 다음을 적용한다.

- `.moc3`, `.model3.json`, texture, motion 등 샘플 모델 원본은 Git에 추가하지 않는다.
- 개발자는 공식 페이지에서 직접 내려받는다.
- 로컬 asset 경로는 Git에서 제외한다.
- CI와 공개 release는 샘플 모델 없이도 빌드되어야 한다.
- 샘플 모델이 없으면 정적 placeholder 또는 CSS idle character로 동작한다.
- 저작권 고지와 모델별 요구 문구를 개발 화면에 표시한다.

공개 binary에 샘플 runtime asset을 포함할 수 있는지는 선택한 모델의 개별 조건, Free Material License의 `Distribute`와 `Redistribute` 구분, 배포 형태를 기준으로 다시 확인한다. 확인 전에는 포함하지 않는다.

### SDK 라이선스 경계

샘플 모델 사용 허가와 Cubism SDK 배포 허가는 별개다.

- 개발과 검증은 무료로 시작할 수 있다.
- 공개 배포 시 사업자 규모와 용도에 따라 SDK Publication License가 필요할 수 있다.
- 사용자가 여러 모델을 추가하거나 교체할 수 있는 범용 모델 로더는 `Expandable Application`으로 분류될 가능성이 있다.
- Expandable Application은 개인이나 소규모 사업자도 사전 심사와 특별 계약 대상이다.

따라서 초기 제품은 임의 Live2D 모델 import 기능을 제공하지 않는다. 한 개의 개발용 샘플 모델로 렌더러를 검증하고, 공개 배포 전 자체 제작 모델로 교체한다.

## 첫 vertical slice

### 포함

1. 프로젝트 폴더 선택
2. Codex 인증 상태와 모델 목록
3. thread 목록, 새 thread, resume
4. prompt 전송과 interrupt
5. agent message streaming
6. command, file change, tool item 표시
7. command와 file change 승인
8. unified diff
9. 오른쪽 캐릭터 idle 표시
10. Advisor on/off
11. 수동 조언 요청과 turn 완료 후 선택적 자동 조언
12. Advisor 대사 버블
13. 정적 캐릭터 fallback
14. 로컬 전용 Live2D 샘플 모델 렌더링 spike

### 제외

- 편집 가능한 코드 에디터
- terminal, Git, worktree
- 원격 UI
- 다중 Advisor persona
- 음성 합성
- 사용자 모델 import
- Live2D model marketplace
- 공개 바이너리 내 샘플 모델 번들
- 가짜 점수, 호감도, 테스트 통과율

실제 rate limit, token usage, 변경 파일 수처럼 app-server에서 얻은 데이터만 표시한다.

## 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| app-server 명령과 일부 API의 실험 상태 | 최소 Codex 버전 고정, stable generated schema, startup compatibility check |
| stdio 자식 프로세스 종료 시 in-flight turn 손실 | 첫 범위에서는 수용, 이후 daemon/Unix socket 검토 |
| renderer 권한 상승 | Rust command allowlist, shell/fs 직접 노출 금지 |
| Advisor가 메인 답변과 충돌 | 별도 ephemeral thread, 짧은 조언 계약, 메인 작업 변경 금지 |
| Advisor의 불필요한 토큰 사용 | 기본 off, turn당 최대 한 번, manual-first |
| Live2D 샘플 재배포 위반 | 모델 원본 Git 제외, 로컬 다운로드, 공개 배포 전 자체 모델 교체 |
| Expandable Application 분류 | 임의 모델 import와 marketplace 제외 |
| 캐릭터 IP 문제 | 기존 상업 IP 대신 자체 캐릭터 또는 명시적 라이선스 자산 사용 |
| 전체 IDE로 범위 팽창 | transcript, activity, diff, preview까지만 구현 |

## 직접 검증한 환경 동작

다음 로컬 명령과 프로토콜 동작을 확인했다.

```text
codex --version
→ codex-cli 0.150.1

codex app-server --help
→ stdio, Unix socket, WebSocket, schema generation 지원 확인

codex app-server generate-ts --help
→ stable 기본 생성 및 --experimental 분리 확인
```

`codex app-server --listen stdio://`에 대해 다음 JSON-RPC 요청의 응답을 확인했다.

- `initialize`
- `account/read`
- `model/list`
- `thread/list`

수동 검증에 사용한 PTY는 입력 echo 때문에 `trailing characters` 경고를 한 번 발생시켰다. 실제 앱에서는 PTY가 아닌 pipe 기반 stdio를 사용한다.

## 후속 구현 순서

1. Tauri 2 + React/TypeScript 셸
2. Rust app-server process supervisor와 initialize handshake
3. generated stable TypeScript schema 연결
4. thread/start, thread/resume, turn/start 스트리밍
5. item reducer와 approval routing
6. diff UI와 project/thread shell
7. Advisor toggle, ephemeral thread, snapshot 계약
8. 정적 캐릭터 fallback
9. 공식 샘플을 로컬에서만 사용하는 Live2D renderer spike
10. 자체 캐릭터 asset 계약과 공개 배포 라이선스 검토
