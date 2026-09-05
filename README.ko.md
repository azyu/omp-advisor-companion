<p align="center">
  <img src="assets/advisor.png" width="320" alt="OMP Advisor Companion">
</p>

<p align="center">
  <strong>OMP용 크기 제한형 인프로세스 Advisor 컴패니언 위젯</strong>
</p>

<p align="center">
  <a href="https://github.com/can1357/oh-my-pi"><img src="https://img.shields.io/badge/OMP-18%2B-7AA2F7?style=flat&colorA=222222" alt="OMP 18+"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/plugin%20install-Bun%201.3.14%2B-f472b6?style=flat&colorA=222222" alt="플러그인 설치용 Bun 1.3.14+"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&colorA=222222&logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

<p align="center">
  <a href="https://github.com/can1357/oh-my-pi">Oh My Pi</a>의 기존 Advisor 런타임을 기반으로 제작되었습니다.
</p>

<p align="center">
  <a href="README.md">English</a> · 한국어
</p>

`omp-advisor-companion`은 정적 캐릭터 이미지와 최신 Advisor 노트를 편집기 위의 OMP 위젯에 표시합니다. 기본적으로 위젯은 Advisor 메시지가 도착할 때만 나타나며, `alwaysVisible`을 사용하면 첫 노트 전에도 대기 중인 이미지와 빈 말풍선을 계속 표시할 수 있습니다. 호스트 폭이 넓으면 이미지와 말풍선을 나란히 배치하고, 좁으면 이미지를 말풍선 위에 배치합니다. 위젯은 모달이 아니며 포커스를 가져가지 않습니다. OMP의 기본 Advisor 기록 카드를 숨겨 각 노트가 한 번만 표시되도록 합니다.

별도의 리뷰어 모델은 실행하지 않습니다. 대신 OMP에 내장된 Advisor 메시지를 관찰하고, 고정된 `omp-advisor-companion` 키 하나로 위젯을 갱신합니다.

말풍선 헤더에는 `<concern>`과 같은 심각도 태그만 표시됩니다.

<p align="center">
  <img src="assets/screen-shot.png" width="100%" alt="OMP Advisor Companion 스크린샷">
</p>

## 요구 사항

- [OMP](https://github.com/can1357/oh-my-pi) 18.1.0 이상
- 설정된 OMP Advisor 모델
- OMP 플러그인 패키지 관리를 위해 `PATH`에서 실행할 수 있는 [Bun](https://bun.sh) 1.3.14 이상

플러그인 자체는 호스트 OMP 프로세스 안에서 실행되므로 설치 후 별도의 Bun 런타임이 필요하지 않습니다. 다만 OMP 플러그인 관리자는 Git/npm 플러그인을 설치하거나 재설치하거나 제거할 때 외부 `bun` 실행 파일을 호출합니다. Bun으로 OMP를 설치한 사용자는 이미 이 요구 사항을 충족합니다. 사전 빌드된 OMP 바이너리나 Homebrew 또는 Nix로 OMP를 설치한 사용자는 이 README의 플러그인 관리 명령을 실행하기 전에 Bun을 별도로 설치해야 합니다.

Kitty 그래픽 지원은 선택 사항입니다. Kitty 그래픽을 사용할 수 없으면 OMP의 `Image` 컴포넌트가 이미지 대신 대체 텍스트를 표시합니다.

## 설치

GitHub 저장소에서 직접 설치합니다.

```sh
omp plugin install github:azyu/omp-advisor-companion
```

전체 Git URL을 사용해도 동일합니다.

```sh
omp plugin install https://github.com/azyu/omp-advisor-companion
```

설치 후 OMP를 재시작하세요. OMP 18 이상에서는 `/reload-plugins`로 플러그인이 제공하는 스킬, 명령, 에이전트, MCP 상태를 갱신할 수 있지만, 실행 중인 프로세스에서 확장 팩터리를 다시 불러오지는 않습니다.

설치된 플러그인을 확인합니다.

```sh
omp plugin list
```

## Advisor 설정

이 플러그인은 OMP Advisor를 그대로 사용하며 Advisor 모델 자체를 설정하지 않습니다. 최소 `~/.omp/agent/config.yml` 설정 예시는 다음과 같습니다.

```yaml
modelRoles:
  advisor: gpt-5.6-sol

advisor:
  enabled: true
```

OMP에 설치된 Advisor 지원 모델이라면 무엇이든 사용할 수 있습니다. 모델 역할, `WATCHDOG.md`, 다중 Advisor 구성에 관한 내용은 OMP의 [Advisor 문서](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md)를 참고하세요.

## 사용법

OMP를 시작한 뒤 내장 명령을 사용합니다.

```text
/advisor on
/advisor status
/advisor off
```

동작 방식:

- `/advisor on`은 미러링을 활성화하지만, 기본적으로는 유효한 Advisor 메시지가 도착할 때까지 위젯을 숨깁니다. 반복 실행해도 결과는 같습니다.
- 위젯은 호스트 폭이 충분하면 이미지와 말풍선을 나란히 표시하고, 좁으면 이미지를 말풍선 위에 배치합니다.
- Kitty 직접 출력을 사용할 때는 자체 완결형 이미지 블록을 말풍선 앞에 끊김 없이 배치하며 정렬용 공백을 추가하지 않습니다. 이미지 블록은 바이트 단위로 동일하게 유지됩니다.
- 말풍선 헤더에는 `Advisor`나 Advisor 이름 없이 `<concern>`과 같은 심각도 태그만 표시합니다.
- 유효한 Advisor 메시지가 도착하면 최신 유효 노트를 담은 이미지·말풍선 그룹을 생성하거나 기존 그룹을 교체합니다. 단, 미러링을 명시적으로 끈 상태에서는 무시합니다.
- `alwaysVisible: true`이면 세션 시작과 `/advisor on` 직후 이미지와 빈 대기 말풍선을 표시합니다. 이후 Advisor 노트는 새 노트로 교체되거나 `/advisor off`를 실행하거나 세션이 끝날 때까지 카운트다운 없이 유지됩니다.
- `alwaysVisible`이 `false`이면 표시된 노트는 `displayDurationSeconds`초(기본값 `30`) 동안 유지됩니다. 말풍선 하단 테두리 오른쪽에는 `[ hides in Ns ]`가 표시되며 매초 갱신됩니다. 카운트다운이 `1s`에 도달하면 위젯을 숨깁니다. 새 노트가 표시되면 현재 위젯을 교체하고 숨김 타이머와 카운트다운을 모두 다시 시작합니다. `0`으로 설정하면 자동 숨김과 카운트다운을 비활성화합니다.
- `/advisor off`는 위젯을 제거하고 현재 노트를 버리며, 다시 활성화할 때까지 이후 Advisor 메시지를 호스트의 기본 처리에 맡깁니다.
- 세션 전환과 종료 시 위젯을 지우고 미러링 상태를 초기화합니다. 세션 시작 시에도 먼저 초기화하며, `alwaysVisible`이 켜져 있으면 대기 위젯을 다시 생성합니다.
- 인수 없이 `/advisor`를 실행하면 확장이 현재 상태를 파악한 뒤에만 상태를 전환합니다. 기본 설정에서는 상태를 알 수 없으면 실제 Advisor 노트가 도착할 때까지 숨김 상태를 유지합니다.
- TUI가 아니거나 UI가 없는 OMP 모드에서는 아무 동작도 하지 않습니다.

이미지는 위젯을 처음 표시해야 할 때 지연 로딩됩니다. 기본 설정에서는 유효한 Advisor 메시지가 도착할 때, `alwaysVisible`을 켠 경우에는 세션 시작 시 불러옵니다. 확정된 각 로컬 이미지 경로에는 재시도 가능한 Promise 캐시를 따로 사용합니다. 성공한 로드는 재사용하고 실패한 로드는 캐시에서 제거하므로, 파일을 수정한 뒤 다시 불러올 수 있습니다. 잘못된 경로, 읽을 수 없는 파일, 지원하지 않는 이미지는 에디터 위에 지속적인 오류를 표시하고 활성화할 때마다 경고를 한 번 출력합니다.

## FAQ

### Windows의 WezTerm에서 Herdr 내부 OMP를 실행할 때 이미지가 보이지 않는 이유는 무엇인가요?

두 가지 경우를 구분해야 합니다.

- WezTerm에서 OMP를 직접 실행하는 경우: OMP는 Kitty 직접 배치를 사용합니다. WezTerm은 Kitty 유니코드 플레이스홀더를 안정적으로 렌더링하지 않으므로 `PI_KITTY_PLACEHOLDERS=1`을 설정하지 마세요.
- Herdr 내부에서 OMP를 실행하는 경우: Herdr가 pane 그리드를 소유합니다. OMP 18.1.0 이상은 명시적으로 활성화하지 않는 한 Herdr 안에서 Kitty 출력을 의도적으로 끕니다. Herdr의 기본값인 `kitty_graphics = false`에서는 `Image` 컴포넌트가 텍스트 대체 표시를 사용합니다. 이미지 경로가 원인은 아닙니다.

Herdr 안에서 실제 이미지를 표시하려면 Herdr의 실험적 Kitty 렌더러를 활성화하세요. 네이티브 Windows에서는 Herdr가 `%APPDATA%\herdr\config.toml`을 읽고, Linux 또는 WSL에서는 `~/.config/herdr/config.toml`을 읽습니다.

```toml
[experimental]
kitty_graphics = true
```

그런 다음 Herdr가 관리하는 셸에서만 Kitty 프로토콜과 플레이스홀더를 설정하세요.

Git Bash 또는 기타 POSIX 셸:

```sh
if [[ "${HERDR_ENV:-}" == "1" ]]; then
  export PI_FORCE_IMAGE_PROTOCOL=kitty
  export PI_KITTY_PLACEHOLDERS=1
fi
```

PowerShell:

```powershell
if ($env:HERDR_ENV -eq "1") {
  $env:PI_FORCE_IMAGE_PROTOCOL = "kitty"
  $env:PI_KITTY_PLACEHOLDERS = "1"
}
```

`herdr server reload-config`를 실행하고 새 Herdr pane을 연 다음 OMP를 재시작해야 렌더러 설정과 환경 변수가 적용됩니다. 이 변수들을 전역으로 export하지 마세요. 직접 실행하는 WezTerm은 일반 Kitty 경로를 사용해야 하고, 지원하지 않는 터미널은 OMP의 텍스트 대체 표시를 사용해야 합니다. 네이티브 Windows와 ConPTY 조합은 터미널에 따라 동작이 달라집니다. Kitty를 활성화한 Herdr에서도 이미지가 표시되지 않으면 WezTerm에서 OMP를 직접 실행하거나 WSL에서 실행하세요. 또는 두 재정의를 제거해 원시 플레이스홀더 글리프 대신 대체 표시를 유지하세요.

## 리소스 설정

기본 에셋은 중립적인 플레이스홀더 캐릭터 이미지인 `assets/advisor.png`입니다. 전역 설정은 OMP 플러그인 설정 명령으로 관리하며, 사용자 전역 런타임 상태로 `~/.omp/plugins/omp-plugins.lock.json`의 `settings.omp-advisor-companion`에 저장됩니다.

```sh
omp plugin config set omp-advisor-companion imagePath /absolute/path.png
omp plugin config set omp-advisor-companion concernImagePath /absolute/concern.png
omp plugin config set omp-advisor-companion imageMaxWidth 20
omp plugin config set omp-advisor-companion imageMaxHeight 14
omp plugin config set omp-advisor-companion bubbleMaxWidth 60
omp plugin config set omp-advisor-companion alwaysVisible true
omp plugin config set omp-advisor-companion displayDurationSeconds 30
omp plugin config list omp-advisor-companion
```

`imagePath`에는 절대 로컬 PNG/JPEG 경로나 활성 프로젝트의 OMP `context.cwd`를 기준으로 한 상대 경로를 지정할 수 있습니다. Windows 드라이브 경로도 지원합니다. PowerShell 예시: `omp plugin config set omp-advisor-companion imagePath 'G:\Working\advisor.jpg'`. 경로 앞의 `~/`는 사용자 홈 디렉터리로 확장됩니다. URL, 데이터 URI, 글로브 패턴, OMP 내부 URI 스킴은 이미지 경로로 해석하지 않습니다.

`nitImagePath`, `concernImagePath`, `blockerImagePath`에도 같은 형식의 경로를 지정할 수 있습니다. 메시지 타입에 해당하는 경로가 비어 있지 않으면 그 이미지를 사용하고, 생략하거나 비워 두면 `imagePath`로 폴백합니다. `alwaysVisible`의 대기 이미지도 `imagePath`를 사용합니다.

프로젝트별 설정은 `.omp/plugin-overrides.json`에 작성합니다. 이 값은 전역 설정 위에 병합되며 현재 프로젝트에서 전역 설정을 덮어씁니다:

```json
{
  "settings": {
    "omp-advisor-companion": {
      "imagePath": "./assets/project-advisor.png",
      "concernImagePath": "./assets/project-advisor-concern.png",
      "imageMaxWidth": 24,
      "imageMaxHeight": 18,
      "bubbleMaxWidth": 72,
      "alwaysVisible": true,
      "displayDurationSeconds": 15
    }
  }
}
```

적용되는 설정의 우선순위는 다음과 같습니다.

1. 타입이 있는 노트와 일치하는 비어 있지 않은 `nitImagePath`, `concernImagePath`, `blockerImagePath`
2. 병합된 OMP 플러그인 설정에서 비어 있지 않은 프로젝트 또는 전역 `imagePath` 값
3. `imagePath`가 비어 있을 때 `OMP_ADVISOR_COMPANION_IMAGE`
4. 번들 플레이스홀더 `assets/advisor.png`

`OMP_ADVISOR_COMPANION_IMAGE`은 실행 시 프로세스 환경에서 읽는 fallback입니다. 적용된 `imagePath`가 비어 있을 때만 사용되며 `omp-plugins.lock.json`에는 저장되지 않습니다.

`alwaysVisible`의 기본값은 `false`입니다. 활성화하면 `displayDurationSeconds`보다 우선하여 대기 그룹을 즉시 표시하고 노트를 자동으로 숨기지 않습니다. 숫자 설정은 유한한 정수로 변환한 뒤 매니페스트에 정의된 범위로 제한합니다. 이미지 너비는 `8`–`40`셀(기본값 `20`), 이미지 높이는 `6`–`30`셀(기본값 `14`), 말풍선 너비는 설정한 경우에만 표시 열 수를 기준으로 `20`–`120`열로 제한합니다. 말풍선 너비를 생략하면 사용 가능한 렌더링 폭을 사용합니다. 표시 시간은 `0`–`3600`초(기본값 `30`)입니다. `alwaysVisible`이 꺼진 상태에서 표시 시간을 `0`으로 설정하면 처음 표시된 노트를 카운트다운 없이 유지하지만 그 노트가 도착하기 전에는 대기 위젯을 표시하지 않습니다. 위젯이 숨겨지거나 `/advisor off`를 실행하거나 세션을 정리하면 카운트다운도 사라집니다. 변경 사항은 `/advisor off` 후 `/advisor on`을 실행하면 적용되며, OMP를 재시작해도 적용됩니다.

## 위젯 경계와 이미지 비율

위젯은 `ctx.ui.setWidget("omp-advisor-companion", factory, { placement: "aboveEditor" })`와 OMP의 `@oh-my-pi/pi-tui` `Image` 컴포넌트를 사용합니다. OMP 18 이상에서 `WidgetPlacement`는 `aboveEditor`와 `belowEditor`만 제공하므로, 이 위젯은 편집기 위에 표시될 뿐 진정한 오른쪽 도크가 아니며 편집기 폭도 예약하지 않습니다. 위젯은 모달이 아니고 포커스를 가져가지 않아야 하므로 `custom` 오버레이를 사용하지 않습니다.

- 기본적으로 유효한 노트가 없으면 위젯이나 이미지, 텍스트를 렌더링하지 않습니다. `alwaysVisible`을 켜면 대기 중에도 이미지와 빈 말풍선을 렌더링합니다.
- 호스트 폭이 충분하면 이미지와 말풍선을 나란히 표시하고, 좁으면 이미지를 말풍선 위에 배치합니다.
- Kitty 직접 출력을 사용할 때는 자체 완결형 이미지 블록을 말풍선 앞에 끊김 없이 배치하며 정렬용 공백을 추가하지 않습니다. 이미지 블록은 바이트 단위로 동일하게 유지됩니다.
- 이미지는 설정한 셀 상한과 호스트 폭에 맞게 표시됩니다.
- 말풍선 너비를 설정하면 지정한 표시 열 수를 넘지 않습니다. 설정하지 않으면 사용 가능한 렌더링 폭을 사용하며, 실제 가용 폭이 더 좁으면 그 폭에 맞춥니다.
- OMP `Image`는 원본 픽셀 종횡비를 유지하면서 설정한 셀 경계 안에 맞춥니다. 1:1, 2:3, 3:4, 가로형 등 PNG 비율별 특수 처리는 필요하지 않습니다.
- `imageMaxWidth`와 `imageMaxHeight`는 강제 출력 크기가 아니라 상한입니다. 설정 스키마의 `min` 값은 설정을 검증할 뿐 최소 렌더링 크기를 강제하지 않습니다.
- 설정을 생략하면 기본값인 `20×14`셀을 적용합니다. 원본 종횡비나 호스트 폭에 따라 OMP가 더 적은 셀을 사용할 수 있습니다. 예를 들어 1:1 PNG는 일반적으로 2:3 PNG보다 더 적은 행을 사용합니다.
- 두 상한을 모두 제거하면 OMP가 가용 폭에 맞춰 이미지를 표시할 수 있지만, 위젯 렌더러에는 신뢰할 수 있는 터미널 높이 제한 정보가 주어지지 않습니다. 따라서 이 플러그인은 이미지가 세로 공간을 과도하게 차지하지 않도록 명시적인 상한을 유지합니다.
- 투명 캔버스 여백도 원본 종횡비에 포함됩니다. 보이는 캐릭터가 설정 경계를 더 채우게 하려면 투명 여백을 잘라내세요.

## 캐릭터 에셋

기본 캐릭터 경로는 다음과 같습니다.

```text
assets/advisor.png
```

에셋 요구 사항:

- 정적 RGBA PNG
- `256 × 256`, 1:1 정사각형
- 투명 배경
- 이미지 안에 텍스트나 말풍선 없음
- 2 MiB 이하 권장

배포 권한이 있는 이미지만 사용하세요. 이 확장은 OMP의 이미지 컴포넌트에 맞게 인코딩하기 전에 설정한 PNG/JPEG 파일의 시그니처를 검증합니다.

## 개발

```sh
bun install
bun run check
bun test
bun run build
```

로컬 체크아웃에서 작업하려면 다음 명령을 사용합니다.

```sh
git clone https://github.com/azyu/omp-advisor-companion
cd omp-advisor-companion
bun install
omp plugin link .
```

`omp plugin link .`는 사용자 전역 개발 심볼릭 링크를 생성합니다. 소스를 변경한 뒤에는 OMP를 재시작해야 합니다.

특정 프로젝트에서만 개발하려면 전역으로 링크하는 대신 해당 프로젝트의 `.omp/settings.json`에 체크아웃 경로를 추가합니다.

```json
{
  "extensions": [
    "/absolute/path/to/omp-advisor-companion"
  ]
}
```

기존 설정을 유지한 채 위 항목을 병합하세요.

핵심 테스트의 검증 대상:

- 정확한 Advisor 명령 파싱
- 정상 및 비정상 Advisor 커스텀 메시지 추출
- 컨트롤러 활성화, 교체, 제거, 오래된 이미지 표시 억제, 비 TUI 동작
- 말풍선 정제와 줄바꿈, 심각도 레이블, 설정 가능한 상한, 너비 제한

프로젝트 구조:

```text
src/
├── index.ts           # OMP 확장, 설정, 상태, 위젯 생명 주기
├── advisor-events.ts  # Advisor 명령, 노트 타입, 메시지 파싱
└── panel-view.ts      # 크기 제한형 이미지 및 말풍선 컴포넌트
```

## 업데이트

이미 설치된 GitHub 플러그인을 업데이트하려면 저장소 설치 명령을 실행하세요.

```sh
omp plugin install github:azyu/omp-advisor-companion
```

이 릴리스를 다시 설치하면 성공 시 `✔ Installed omp-advisor-companion@0.1.2`가 출력되며 `imagePath`를 포함한 기존 플러그인 설정은 보존됩니다. 이 설치 환경에서는 `omp plugin upgrade omp-advisor-companion`이 정상적으로 동작하는 업데이트 경로가 아닙니다.

업데이트 후 OMP를 재시작하세요. `/reload-plugins`는 실행 중인 프로세스에서 확장 팩터리를 다시 불러오지 않습니다.

## 제거

```sh
omp plugin uninstall omp-advisor-companion
```

## 면책 사항

- 번들 플레이스홀더 이미지 (`assets/advisor.png`)는 AI로 생성되었습니다.

## 감사의 말

- [Oh My Pi](https://github.com/can1357/oh-my-pi)는 확장 API, Advisor 런타임, 터미널 이미지 렌더러를 제공합니다.
