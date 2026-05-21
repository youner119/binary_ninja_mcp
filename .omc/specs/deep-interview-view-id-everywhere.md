# Deep Interview Spec: view_id Everywhere + View Lifecycle Tools

## Metadata
- Interview ID: view-id-everywhere
- Rounds: 5 (+ Round 0 topology)
- Final Ambiguity Score: 19%
- Type: brownfield
- Generated: 2026-05-21
- Threshold: 20%
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown

### view-crud
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.85 | 0.35 | 0.298 |
| Constraint Clarity | 0.92 | 0.25 | 0.230 |
| Success Criteria | 0.65 | 0.25 | 0.163 |
| Context Clarity | 0.80 | 0.15 | 0.120 |
| **Total Clarity** | | | **0.810** |
| **Ambiguity** | | | **0.190** |

### view-id-propagation
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.85 | 0.25 | 0.213 |
| Success Criteria | 0.65 | 0.25 | 0.163 |
| Context Clarity | 0.80 | 0.15 | 0.120 |
| **Total Clarity** | | | **0.810** |
| **Ambiguity** | | | **0.190** |

## Topology

| Component | Status | Description | Coverage / Note |
|-----------|--------|-------------|------------------|
| view-crud | active | `create_view` / `list_view` / `delete_view` 신규 MCP 도구 + 대응 HTTP 엔드포인트 | AC §1–5 |
| view-id-propagation | active | ~70 HTTP 라우트 + 60 MCP 도구 전체가 view_id를 필수로 받도록 서명 변경, 서버에서 `resolve_view(view_id)` 디스패치 | AC §6–10 |
| backward-compat | policy-decided | 하위 호환성 미고려: 기존 `load_binary`/`list_binaries`/`select_binary` 즉시 제거, view_id 누락 시 명시적 에러 | Round 0 정책 결정 |

## Goal

Binary Ninja MCP 서버를 **싱글 활성 view** 모델에서 **명시적 view_id 기반 멀티 세션 모델**로 전환한다. 모든 MCP 도구(60개)와 HTTP 엔드포인트(~70개)가 `view_id`를 **필수 매개변수**로 받아 작업 대상 BinaryView를 명시한다. 여러 LLM 클라이언트가 서로 다른 view_id로 독립된 리버싱 세션을 동시 수행할 수 있다. 세 가지 신규 도구(`create_view`, `list_view`, `delete_view`)가 view 라이프사이클을 관리한다.

## Constraints

- `view_id`는 **사용자 지정 alias 문자열** (예: `"crackme1"`)
- `view_id`는 **전역 고유 키**: 같은 view_id로 두 번째 `create_view` 시도 → 409/error
- **같은 파일 서로 다른 view_id로 열기는 허용** (독립된 리버싱 세션)
- `delete_view`는 **BN 내부에서도 BV 완전 언로드** (`bv.file.close()` 또는 동등 호출) — 저장 안 된 분석 결과는 손실
- **모든 60개 MCP 도구가 view_id 필수** — 누락 시 400 에러
- "활성 view" 전역 상태 완전 제거 (`_current_view` 폐기)
- HTTP API 직접 사용자 호환성 미고려 (legacy 도구 즉시 제거)
- 기존 멀티-view 인프라(`_views_by_id` weakref dict, `register_view`, `unregister_by_filename`, `_prune_views`)는 재활용

## Non-Goals

- legacy MCP 도구(`load_binary`, `list_binaries`, `select_binary`)의 alias/deprecation 단계 제공
- HTTP curl 사용자 backward compatibility
- `delete_view` 시 자동 .bndb 저장
- view 간 동시 쓰기 락/직렬화 정책 (별도 후속 작업)
- view_id 생략 시 fallback 정책 (필수 정책으로 결정됨)
- UI 자동 활성 view 동기화 (`_start_bv_monitor`) — 별도 검토

## Acceptance Criteria

### view-crud
- [ ] **AC-1**: `create_view(filepath, view_id="X")` 호출 시 view_id 문자열을 반환하고, BV가 BN에 로드되어 `_views_by_id`에 등록된다.
- [ ] **AC-2**: 동일 view_id로 두 번째 `create_view` 호출 → HTTP 409 / MCP error 응답.
- [ ] **AC-3**: 같은 filepath를 서로 다른 view_id로 두 번 호출 → 두 번 모두 성공하고, 두 개의 독립 BV 인스턴스가 메모리에 존재한다.
- [ ] **AC-4**: `list_view()` → 등록된 모든 view의 목록 반환 (각 항목: `view_id`, `filepath`, `basename`, `arch`, `size` 등).
- [ ] **AC-5**: `delete_view(view_id)` → 해당 BV가 BN에서 unload되고 (`bv.file.close()` 동등 호출), `_views_by_id`에서 제거되며, 후속 호출 시 view-not-found 에러.

### view-id-propagation
- [ ] **AC-6**: 60개 MCP 도구 전체가 `view_id` 매개변수를 필수로 받는다. zod schema에 `view_id: z.string()` 강제.
- [ ] **AC-7**: HTTP 라우트가 `view_id` 미지정 시 400 에러 + `{"error": "view_id required"}`.
- [ ] **AC-8**: 존재하지 않는 view_id로 호출 시 404 에러 + `{"error": "view not found: <view_id>"}`.
- [ ] **AC-9**: 두 view가 활성 상태에서 각각 다른 view_id로 동시 호출 → 서로 간섭 없이 독립 결과 반환 (예: view A의 `rename_function`이 view B 상태에 영향 없음).
- [ ] **AC-10**: 기존 MCP 도구(`load_binary`, `list_binaries`, `select_binary`) + HTTP 라우트(`/load`, `/binaries`, `/views`, `/selectBinary`)가 코드베이스에서 완전히 제거된다.
- [ ] **AC-11**: `save_bndb` 도구도 view_id 매개변수 필수로 받는다.
- [ ] **AC-12**: 플러그인의 전역 `_current_view` 변수가 제거된다 (`BinaryOperations`에서 244+ 참조 모두 `resolve_view(view_id)` 헬퍼로 마이그레이션).

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 기존 `load_binary`/`list_binaries`/`select_binary`와 신규 도구의 관계 | 단순 rename인가? 시맨틱 변경인가? | view = "하나의 파일 = 세션 구별 단위" — 단순 rename + delete_view 추가. legacy 제거. |
| view_id 포맷 | UUID? 정수? 파일명? | 사용자 지정 alias (자유 문자열) |
| view_id 필수성 (Contrarian challenge) | "지금 보는 1개 바이너리" 케이스에서 매번 강제하는 게 오버킬 아닌가? | **항상 필수** — race-free, 명시성 우선. "활성 view" 개념 제거. |
| `delete_view`의 의미 | 등록만 해제? BN에서 close? 자동 저장? | BN에서 close (메모리 해제) — 분석 손실 감수. 명령 이름의 느낌에 맞춤. |
| `create_view` 중복 정책 | view_id 중복? 같은 파일을 두 alias로? | view_id 전역 고유 (중복=에러), 같은 파일 다른 alias=허용 |
| backward compatibility | 기존 도구 deprecation 경로? | 신경 안 씀 — 즉시 제거 |

## Technical Context

### Brownfield 코드베이스 현황
- `plugin/core/binary_operations.py` (3,805 lines): `_current_view` 단일 전역 + `_views_by_id` 멀티-view weakref 딕셔너리 공존 — **인프라 절반 이미 깔려 있음**
- `_current_view` 참조: binary_operations.py 194회, api/endpoints.py 34회, server/http_server.py 16회 (총 **244+ 곳**)
- 멀티-view 헬퍼 (재활용 대상): `register_view`, `unregister_by_filename`, `_prune_views`, `select_view`
- `plugin/server/http_server.py` (2,523 lines): ~70 HTTP 라우트, 모두 `self.binary_ops.current_view` 직접 참조
- `bridge/src/tools.ts` (1,220 lines): 60개 `server.tool(...)` 등록, view_id 매개변수 없음

### 핵심 리팩토링 패턴
```python
# Before (모든 곳)
bv = self.binary_ops.current_view
if not bv: raise RuntimeError("No binary loaded")

# After
bv = self.binary_ops.resolve_view(view_id)   # view_id로 BV 조회
if not bv: raise ViewNotFound(view_id)
```

### BN API 제약 (`~/Tools/binaryninja/api-docs/` 참조)
- `bn.load(filepath, update_analysis=False)` → 새 BV 생성
- `bv.file.close()` → BV 메모리 해제 (`binaryninja.filemetadata-module.html` 참조 필요)
- 같은 BV에 동시 쓰기 작업은 thread-unsafe 가능 — 본 spec 범위 밖 (별도 후속)
- `bv.update_analysis()` 는 비동기, 응답 지연 가능 — 본 spec 범위 밖

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| View | core domain | view_id, filepath, lifecycle: created→active→deleted | wraps 1:1 BinaryView; identified by view_id |
| BinaryView | core domain (BN object) | (BN built-in: functions, types, segments, etc.) | owned 1:1 by View |
| Session | core domain (≈ View) | view_id (same as View) | 1:1 with View — view = session |
| view_id | identifier | user-assigned alias string, globally unique | primary key for View |
| DeleteAction | lifecycle event | triggers bv.file.close() | causes View transition to deleted state |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 4 | 0 | 0 | 4 | 100% |
| 3 | 5 | 1 (DeleteAction) | 0 | 4 | 80% |
| 4 | 5 | 0 | 0 | 5 | 100% |
| 5 | 5 | 0 | 0 | 5 | 100% |

도메인 모델이 Round 2에 빠르게 수렴. Round 3에서 DeleteAction 추가 후 다시 안정화.

## Resolved Micro-Decisions

사용자 주도 후속 결정 라운드(10/10)를 거쳐 모든 micro-decision이 확정되었다. 시기: 2026-05-21.

### Decision 1 — HTTP 전달 방식
**선택**: Query string 전용 (`?view_id=xxx`)
**근거**: 기존 코드의 99%가 이미 `_parse_query_params()` 패턴; curl/디버깅 가장 쉬움; `view_id`는 작은 식별자라 query에 적합.
**적용**: 모든 ~70 HTTP 라우트가 `params.get("view_id")` 패턴으로 추출. POST body는 추가 데이터용으로만.

### Decision 2 — `_current_view` 전역 상태
**선택**: 완전 제거
**근거**: spec이 "view_id 필수 + 활성 view 개념 제거" 명시 → fallback 의미 없음. private 보존하면 LLM이 실수로 의존할 위험.
**적용**: `BinaryOperations._current_view` 필드/property/setter 삭제. 244곳 참조 모두 `resolve_view(view_id)` 호출로 마이그레이션.

### Decision 3 — `resolve_view` 헬퍼 설계
**선택**: `ViewNotFound(Exception)` raise + HTTP top-level catch
**근거**: 60곳 caller가 `if bv is None` 보일러플레이트 없이 한 줄 사용 가능. Exception 상속(BaseException 아님) — 정상 에러 흐름, 일부 핸들러가 부분 결과로 변환할 여지.

```python
class ViewNotFound(Exception):
    def __init__(self, view_id: str):
        self.view_id = view_id
        super().__init__(f"view not found: {view_id!r}")

def resolve_view(self, view_id: str) -> bn.BinaryView:
    if not view_id or not isinstance(view_id, str):
        raise ValueError("view_id required (non-empty string)")
    self._prune_views()
    w = self._views_by_id.get(view_id)
    if w is None:
        raise ViewNotFound(view_id)
    bv = w()
    if bv is None:
        self._views_by_id.pop(view_id, None)
        raise ViewNotFound(view_id)
    return bv
```

HTTP 핸들러에 `except ViewNotFound as nf: self._send_json_response(..., 404)` + `except ValueError as ve: ..., 400` 추가. 이미 결정된 `AnalysisNotReady` catch 위치와 같은 패턴.

### Decision 4 — 마이그레이션 전략
**선택**: 3-phase
**근거**: 각 phase가 단독 ship 가능; Phase 1만으로도 검증 가능; commit 단위는 phase별, 필요 시 phase 내부에서 추가 분할 가능.

| Phase | 범위 | AC 게이트 |
|---|---|---|
| **Phase 1** | resolve_view + ViewNotFound + HTTP top-level catch + create/list/delete_view 신규 도구. legacy/`_current_view` 손대지 않음. | AC-1 ~ AC-5 |
| **Phase 2** | 60개 bridge zod에 view_id 추가 + ~70 HTTP 라우트 view_id 파싱 + binary_operations 메소드 시그니처 변경. legacy는 그대로 작동. | AC-6 ~ AC-9 |
| **Phase 3** | legacy MCP 도구/HTTP 라우트 제거 + `_current_view` 완전 삭제 + UI 자동 동기화 코드 제거 (Decision 9). | AC-10 ~ AC-12 |

### Decision 5 — `create_view` / `list_view` / `delete_view` 응답 schema

**`create_view`** (분석 시작 직후 즉시 응답):
```json
{
  "view_id": "crackme1",
  "filepath": "/abs/path/to/binary",
  "basename": "binary",
  "arch": "x86_64",
  "platform": "linux-x86_64",
  "entry_point": "0x401234",
  "analysis_state": "AnalyzeState",
  "analysis_progress_pct": 35
}
```

**`list_view`** (간결, 상세는 별도 호출):
```json
{
  "views": [
    {"view_id": "crackme1", "filepath": "...", "basename": "...", "arch": "x86_64", "analysis_state": "IdleState"}
  ]
}
```

**`delete_view`**:
```json
{"view_id": "crackme1", "deleted": true}
```

**제외 필드와 이유**:
- `function_count` — 분석 중 폭증(afterimage 사례: 1500→9500). 잘못된 정보 위험.
- `size`/`endianness` — arch에 endian 내포; size 활용도 낮음.
- list_view에서 `entry_point`/`progress_pct` — 목록은 짧게.

### Decision 6 — 에러 코드 매핑

| 상황 | HTTP | 응답 body |
|---|---|---|
| `view_id` 누락 | **400** | `{"error": "view_id required"}` |
| `view_id` 존재 안 함 | **404** | `{"error": "view not found: X", "view_id": "X"}` |
| `create_view` 시 view_id 중복 | **409** | `{"error": "view_id already exists: X", "view_id": "X"}` |
| `create_view` 시 filepath 없음 | **400** | `{"error": "filepath not found: ...", "filepath": "..."}` |
| `create_view` 시 `bn.load` 실패 | **422** | `{"error": "...", "filepath": "..."}` |
| 분석 진행 중 | **202** | `{"analysis_in_progress": true, ...}` (이미 구현) |
| 함수 못 찾음 | **404** | `{"error": "function not found: X"}` |
| 서버 내부 예외 | **500** | `{"error": "..."}` |

응답 body는 가능한 곳마다 `view_id` 필드를 echo해서 LLM이 어떤 view에서 실패했는지 즉시 파악하게 한다.

### Decision 7 — 동시성 정책
**선택**: 정책 없음 (last-wins, BN 자체 락 신뢰)
**근거**: 멀티세션 목적은 "각자 다른 view로 동시 작업"; 같은 view_id 동시 write는 본 spec 범위 아님; BN Python API가 BV mutating 작업을 내부 직렬화하므로 crash 안 남; YAGNI.

**spec 명시 문구**: 같은 view_id에 대한 동시 write는 BN 내부 락에 의해 직렬화되며, 결과 순서는 정의되지 않음 (last-wins). 같은 view에서 동시 쓰기가 필요한 워크플로우는 본 spec 범위 밖.

### Decision 8 — Bridge zod 일괄 적용 패턴

**선택**: baseSchema 스프레드 + 핸들러 명시 전달

```typescript
// bridge/src/tools.ts 상단 공통 상수
const viewIdField = {
  view_id: z.string().describe(
    "Target view alias (from create_view). Required for all operations — " +
    "each session must explicitly specify which view to operate on."
  ),
};

// 모든 도구 60곳 동일 패턴
server.tool(
  "decompile_function",
  "Decompile...",
  { ...viewIdField, name: z.string()/*, ...*/ },
  async ({ view_id, name }) => {
    const data = await client.getJson("decompile", { view_id, name });
    // ...
  }
);
```

**근거**:
- DRY + 명시적 (grep 가능)
- 헬퍼 함수 추상화 안 함 — tools.ts 가독성 유지
- axios interceptor 자동 첨부 안 함 — spec("LLM이 view_id 명시적 다룸")과 충돌하므로 거부
- 누락은 zod required field라 빌드 시 TS 타입 에러로 즉시 탐지

### Decision 9 — UI 자동 동기화 제거
**선택**: UI 통합 완전 제거 (사용자가 BN GUI 워크플로우 사용 안 함)

**제거 대상**:
- `plugin/__init__.py`의 `_start_bv_monitor`
- `_MCPMaxUINotification.OnViewChange` / `OnAfterOpenFile` / `OnBeforeCloseFile` / `OnAfterCloseFile`
- `_try_autostart_for_bv`
- BN UI 활성 view를 자동으로 `current_view`에 동기화하는 모든 코드

**유지 대상**:
- `🟢 MCP: Running` 상태 인디케이터 (`_status_button`)
- `BinaryViewType.add_binaryview_initial_analysis_completion_event` 같은 BN core API 이벤트 — `create_view` 후속 처리에 여전히 유용. Phase 3 구현 시 재검토.

### Decision 10 — 테스트 인프라
**선택**: pytest fixture + Phase 종료마다 BN 실제 띄워서 검증 게이트

**근거**: BN GUI 자동 시작/종료 사이클이 2초/1초로 검증됨 (PID 추적, kill로 클린 종료) → 정통 통합 테스트 부담 없음.

**구조**:
- `tests/conftest.py`: BN 자동 시작 + `:9009` polling + 종료 fixture (session scope)
- `tests/test_view_crud.py`: AC-1 ~ AC-5
- `tests/test_view_id_propagation.py`: AC-6 ~ AC-9
- `tests/test_legacy_removal.py`: AC-10 ~ AC-12
- `tests/fixtures/`: 작은 hello-world ELF 1-2개

**Phase 게이트 정책**: 각 Phase 종료 시 해당 AC 테스트가 **전부 통과해야** 다음 Phase 진입.

**의존성 추가**: `pytest`, `requests` (개발 의존성). `requirements-dev.txt` 또는 `pyproject.toml [project.optional-dependencies]`.

---

## Phase-AC 매핑 (요약)

| Phase | 종료 게이트 (AC 통과 요구) |
|---|---|
| Phase 1 | AC-1, AC-2, AC-3, AC-4, AC-5 (view-crud 5개) |
| Phase 2 | AC-6, AC-7, AC-8, AC-9 (view_id 전파 4개) |
| Phase 3 | AC-10, AC-11, AC-12 (legacy 제거 3개) |

## Interview Transcript

<details>
<summary>Full Q&A (Round 0 + 5 rounds)</summary>

### Round 0 (Topology)
**Q:** 이 토폴로지가 맞나요? (view-crud / view-id-propagation / backward-compat 3 컴포넌트)
**A:** "backward-compat는 신경 안 쓴다 — 제거" → 기존 도구 즉시 제거, view_id 누락 시 에러, HTTP 직접 사용자 미고려

### Round 1 (view-crud / Goal Clarity)
**Q:** 신규 3개 도구와 기존 3개 도구의 관계는?
**A:** "view을 열어서 하나의 파일을 여는, view는 세션을 구별하기 위한" → view = 1 파일 = 1 세션, 단순 rename + delete_view 추가
**Ambiguity:** 47% → 41% (Goal Clarity 0.5→0.85)

### Round 2 (view-id-propagation / Constraints)
**Q:** view_id 포맷과 생성 주체?
**A:** "사용자 지정 가능 (이름/알리아스)" → 자유 문자열 alias, 서버 fallback 가능
**Ambiguity:** 41% → 37%

### Round 3 (view-crud / Constraints)
**Q:** `delete_view`의 정확한 의미?
**A:** "BN에서도 닫기 (메모리 해제)" → `bv.file.close()` 동등 호출, 분석 손실 감수
**Ambiguity:** 37% → 32%

### Round 4 (view-id-propagation / Constraints, Contrarian Mode)
**Q:** view_id는 언제 필수, 언제 옵셔널?
**A:** "항상 필수 (명시적, race-free)" → 모든 60 도구 강제, 활성 view 개념 제거
**Ambiguity:** 32% → 26%

### Round 5 (view-crud / Constraints)
**Q:** `create_view` 중복/충돌 정책 (두 시나리오 동시)?
**A:** "같은 view_id 두 번 → 에러 / 같은 파일 서로 다른 view_id → 허용"
**Ambiguity:** 26% → **19%** ✅
</details>

---

## Status: PASSED · pending approval

이 spec은 명확도 임계값을 통과했으며 실행 승인 대기 상태입니다.
