# **주식 빌딩 시티 (가칭) PRD**

Nov 23, 2026 · @Dongjun Baek

## **1\. 개요**

주식 빌딩 시티(가칭)는 종목을 빌딩으로, 내 평단가를 층수로 표현해 같은 층에 사는 투자자끼리 소식을 공유하고 소통하는 3D 웹 커뮤니티다. 사용자는 아바타로 마을 거리를 거닐다 빌딩에 입장하고, 같은 층 사람들과 대화하고 소식을 나눈다. MVP는 삼성전자와 SK하이닉스 두 빌딩으로 시작한다.

**배경과 문제 (가설)**

* 주가 급락기에는 종목 소식과 생각을 나누고 싶어도, 같은 처지의 사람들과 소통할 곳이 마땅치 않다.  
* 종목 토론방은 모두가 한 공간에 섞여 소식이 묻히고 대화가 비난과 선동으로 흐르기 쉽다는 가설을 검증한다. 평단가가 비슷한 사람끼리 묶으면 소식이 더 공감되고 대화가 부드러워질 것이라는 가설이다.

**목표**

1. 같은 층 입주민이 종목 소식과 생각을 서로 공유하는 습관을 만든다.  
2. 평단가 하나만 입력하면 1분 안에 입주해 같은 층 사람들과 실시간으로 소통을 시작한다.  
3. 투자 권유, 허위 소식, 위기 상황을 통제하는 안전한 커뮤니티를 만든다.

**비목표 (MVP 제외)**

* 증권사 연동과 평단가 자동 인증  
* 실제 시세 연동과 현재가·손익 표시  
* 종목 추천, 매매 신호, 주문 기능  
* 모바일 네이티브 앱 (웹 우선)  
* 삼성전자, SK하이닉스 외 종목

## **2\. 타깃 사용자와 핵심 시나리오**

주가 하락장에서 삼성전자와 SK하이닉스를 보유한 한국 개인 투자자를 주 타깃으로 한다.

| 페르소나 | 상황 | 원하는 것 |
| :---- | :---- | :---- |
| 평단이 높은 투자자 | 평단이 높아 높은 층에 있음 | 같은 층 사람들과 소식을 나누고 의견 듣기 |
| 물타기 투자자 | 추가 매수로 평단을 내리는 중 | 물타기 소식을 나누고 같은 층의 응원 받기 |
| 평단이 낮은 투자자 | 평단이 낮아 낮은 층에 있음 | 내 층 소식을 가볍게 챙겨 보는 눈팅족 |

**핵심 시나리오**

1. 마을에 접속해 거리를 거닐다 삼성전자 빌딩에 입장하고, 엘리베이터 화면에서 평단가 17만 원을 입력해 17층으로 이동한다.  
2. 17층 라운지에서 다른 입주민과 인사하고, 17층 소식 게시판에서 오늘의 종목 소식을 확인한다.  
3. 오늘 본 공시나 기사를 소식 게시판에 짧게 올리고, 같은 층 입주민의 공감 반응과 댓글을 받는다.  
4. 하루 1회, 엘리베이터에서 층 버튼을 직접 눌러 다른 층으로 이동해 그 층의 소식을 이어 본다.

## **3\. 핵심 컨셉과 층 규칙**

빌딩은 종목, 층수는 내 평단가다. 사용자가 평단가를 수동으로 입력하면 시스템이 층을 계산해 그 층으로 이동시킨다. 같은 층 입주민은 라운지에서 실시간으로 대화하고, 층 소식 게시판에서 소식을 공유한다.

| 규칙 | 내용 |
| :---- | :---- |
| 층 계산 | 층 \= 평단가 ÷ 1만 원, 소수점 내림. 삼성전자와 SK하이닉스 모두 1층 \= 1만 원이라 삼성전자 평단 17만 원이 17층 |
| 층 단위 | 삼성전자와 SK하이닉스 모두 1층 \= 1만 원. 종목을 추가할 때 빌딩별로 따로 설정 |
| 최저층과 최고층 | 평단이 1층 단위 미만이면 1층, 빌딩 최고층을 넘으면 옥상(펜트하우스) |
| 통합 저층 | 낮은 층 구간은 하나의 층으로 합친다. 삼성전자는 1\~5층(평단 6만 원 미만), SK하이닉스는 1\~100층(평단 101만 원 미만)이 각각 한 층이며 표시 층은 1층으로 한다(제안). 그 위는 실제 층수 그대로 (삼성전자 6층부터, SK하이닉스 101층부터) |
| 평단가 입력 | 엘리베이터 화면에서 수동 입력(자기 신고). 타인에게는 층수만 노출하고 정확한 평단가는 비공개 |
| 층 이동 | 엘리베이터에서 사용자가 층 버튼을 직접 눌러 이동하며, 하루 1회만 가능하다. 최초 평단가 입력으로 배치되는 이동은 횟수에 포함하지 않는 것으로 제안한다. 이동 가능한 층은 제한할 예정이며 범위는 추가 검토 중 (오픈 이슈) |
| 시세 반영 | MVP에서 제외. 현재가와 손익 구간을 표시하지 않고, 평단가에 따른 층수만 사용한다 |
| 해외 종목 | MVP 밖. 통화별 층 단위를 따로 두는 방향으로 후속 검토 |

엘리베이터에서 층 버튼을 눌러 이동하고, 도착한 층의 사람들과 소식을 나누는 경험이 이 서비스의 핵심이다.

## **4\. 사용자 플로우**

최초 진입부터 층 라운지 대화까지 다섯 단계이며, 입주까지 1분 이내를 목표로 한다.

1. **마을 진입**: 로그인하고 닉네임을 정하면 마을에 들어가 캐릭터로 거리를 거닌다. 거리에 삼성전자와 SK하이닉스 두 빌딩이 서 있고, 입구에서 입장할 수 있다.  
2. **빌딩 입장**: 빌딩 입구로 들어가면 화면이 엘리베이터 화면으로 전환된다.  
3. **평단가 입력과 층 이동**: 엘리베이터 화면에서 평단가를 수동 입력하면 계산된 층으로 이동하는 연출이 재생된다 (첫인상 핵심 순간).  
4. **층 라운지**: 같은 층 입주민과 이동, 이모트, 말풍선 대화, 채팅을 하고, 층 소식 게시판에서 소식을 읽고 올린다. 방 인원이 가득 찼으면 같은 층의 다른 방으로 배정된다.  
5. **엘리베이터 층 이동**: 엘리베이터에서 층 버튼을 직접 눌러 다른 층으로 이동할 수 있으며, 하루 1회로 제한된다. 건물을 나가면 마을 거리로 돌아온다.

## **5\. 기능 요구사항**

P0 열두 개가 MVP 출시 조건이고, P1은 베타 전, P2는 출시 후 후보다.

| ID | 기능 | 우선순위 | 수용 기준 |
| :---- | :---- | :---- | :---- |
| F1 | 3D 마을 씬 | P0 | 거리와 건물 2동 표시, 건물 입구 입장, 카메라 회전과 줌, 모바일 브라우저에서 초당 30프레임 이상 |
| F2 | 박스 캐릭터와 이동 | P0 | 클릭·터치 이동, 걷기 애니메이션, 닉네임 표시 |
| F3 | 로그인과 닉네임 | P0 | 이메일 또는 소셜 로그인, 닉네임 중복 방지 |
| F4 | 평단가 입력과 층 계산 | P0 | 엘리베이터 화면에서 입력, 숫자 검증, 3장 규칙대로 계산 (평단 17만 원 → 17층), 계산된 층으로 이동 |
| F5 | 엘리베이터 화면과 층 버튼 | P0 | 건물 입장 시 엘리베이터 화면으로 전환, 층 버튼 패널과 층 이동 연출, 도착 후 라운지 진입 |
| F6 | 층 라운지 실시간 동기화 | P0 | 같은 층 위치·이모트 동기화, 방당 인원 상한(기본 30명) 초과 시 방 분할 |
| F7 | 말풍선과 채팅 | P0 | 금칙어 필터, 도배 방지, 말풍선 자동 소멸 |
| F8 | 신고와 차단 | P0 | 메시지·유저 신고, 차단한 유저의 채팅 숨김 |
| F9 | 위기 키워드 감지와 안내 | P0 | 위기 키워드 감지 시 해당 메시지 비노출과 본인에게만 위로·상담 안내 표시 |
| F11 | 엘리베이터 층 이동 | P0 | 엘리베이터에서 층 버튼을 직접 눌러 이동, 하루 1회 제한(최초 배치 제외), 남은 이동 횟수 표시, 이동 가능한 층은 제한 (범위 검토 중) |
| F16 | 층 소식 게시판 | P0 | 같은 층 입주민만 소식(300자 이내, 출처 링크 선택)을 작성·열람, 최신순 목록, 라운지 방이 나뉘어도 층 단위로 공유 |
| F17 | 소식 반응과 댓글 | P0 | 소식에 이모지 반응과 짧은 댓글, 투자 권유·허위 소식 신고 가능 |
| F12 | 공유 카드 | P1 | 내 층수·빌딩 이미지 생성, 정확한 평단가 미표시 |
| F18 | 소식 알림 | P1 | 내 층에 새 소식이 올라오면 접속 시 안 읽은 소식 수를 엘리베이터와 건물 아이콘에 표시 (푸시 알림은 제외) |
| F13 | 캐릭터 꾸미기 | P2 | 머리색, 옷색, 모자 조합 |
| F15 | 빌딩 추가 | P2 | 종목 추가 시 층 단위, 통합 저층 범위, 외관만 설정하면 생성 |
| F19 | 오늘의 층 소식 요약 | P2 | 하루 동안 반응이 많은 소식 상위 3개를 층 입구에 고정 표시 |

## **6\. 비기능 요구사항**

모바일 브라우저에서 부드럽게 돌아가고, 정확한 평단가를 노출하지 않는 것이 기준이다.

| 영역 | 요구사항 |
| :---- | :---- |
| 성능 | 중급 스마트폰 브라우저에서 초당 30프레임 이상. 건물은 박스 인스턴싱으로 그리고 그림자와 고해상도 텍스처는 쓰지 않는다 |
| 초기 로딩 | 외부 모델 없이 코드로 생성하는 에셋 위주로 가볍게 유지 |
| 실시간성 | 위치 동기화는 초당 몇 차례로 제한해 대역폭을 절약 |
| 개인정보 | 평단가는 서버에 저장하되 화면에는 층수만 노출. 이메일은 암호화 저장, 수집 항목 최소화, 탈퇴 시 삭제 |
| 보안 | 인증 토큰 기반 접속, 서버에서 층 재계산 검증, 메시지 도배·리미트 제한 |
| 접근성 | 키보드·터치 조작 모두 지원, 색만으로 층이나 상태를 구분하지 않고 층수 텍스트를 함께 표시 |
| 운영 | 접속자 수, 방 분할 비율, 신고 건수 모니터링 |

## **7\. 안전, 규제, 커뮤니티 정책**

소식을 나눠도 되는 범위를 분명히 정하고, 위기 상황은 시스템이 먼저 감지해 대응한다. 폭락장이 타깃이라 이 영역은 출시 조건이다.

| 영역 | 정책 |
| :---- | :---- |
| 투자 권유 금지 | 특정 종목의 매수·매도 권유, 수익 보장, 유료 리딩방 유도 소식을 금지한다. 투자자문 규제에 저촉될 수 있어 출시 전 법률 검토가 필요하다 (오픈 이슈) |
| 소식의 신뢰 | 출처 링크를 달면 출처 표시 배지를 붙이고, 허위 신고가 쌓이면 소식을 임시 숨김 후 검토한다 |
| 개인정보 보호 | 전화번호, 계좌번호, 실명 등 개인 식별 정보가 포함된 소식과 채팅은 자동 차단한다. 정확한 평단가는 게시할 수 없다 |
| 위기 키워드 대응 | 극단적 선택을 암시하는 표현이 감지되면 해당 글을 다른 사람에게 보이지 않고 작성자에게만 위로와 상담 안내(자살예방상담전화 109 등)를 표시한다. 출시 전 최신 번호를 확인한다 |
| 밈에 대한 주의 | 극단적 선택을 밈처럼 쓰는 표현은 금칙어에 항상 포함하고 운영자가 정기적으로 목록을 갱신한다 |
| 신고와 제재 | 신고된 소식·메시지는 24시간 이내 검토를 목표로 하고, 반복 위반자는 작성·입장을 제한한다 |
| 공지 | 평단가는 자기 신고이며 투자 조언이 아닌 커뮤니티 서비스라는 점을 입장 화면과 약관에 명시한다 |

## **8\. 그래픽과 에셋 가이드**

레고·로블록스풍의 로우폴리 3D를 쓰되, 외부 모델 의존 없이 코드로 생성하는 에셋을 우선한다. 참조 이미지는 분위기 참고용이며 캐릭터는 오리지널로 설계한다.

| 항목 | 가이드 |
| :---- | :---- |
| 건물 | 층 모듈(박스 \+ 창문 텍스처 \+ 외벽 패널)을 종목별 층수만큼 반복해 쌓는다. 1층 로비와 옥상은 별도 모델. 삼성전자는 회색 유리, SK하이닉스는 붉은 벽돌톤으로 외관을 구분 |
| 캐릭터 | 박스 6조각(머리, 몸통, 팔 2, 다리 2)을 코드로 생성하고 걷기·손 흔들기는 각도 회전으로 처리. 로블록스 캐릭터를 그대로 따라 하지 않는다 |
| 라운지 소식 보드 | 라운지 벽면에 "층 소식 보드" 오브젝트를 두고, 누르면 2D 패널로 소식 목록과 작성 화면이 열린다. 새 소식이 있으면 보드에 새 소식 표시가 뜨는 것이 연출의 중심 |
| 마을 거리 | 도로, 인도, 가로등, 나무로 이루어진 짧은 거리에 두 빌딩의 입구를 둔다. 캐릭터가 거리를 거닐다 입구에 다가가면 입장 버튼이 뜬다 |
| 엘리베이터 화면 | 건물 입장 시 전환되는 엘리베이터 내부 화면. 평단가 입력창, 층 버튼 패널, 층 표시등을 박스와 2D UI로 구성하고, 이동 연출은 짧은 카메라 이동과 층 숫자 변화로 처리한다 |
| 소품 | 가로등, 나무, 도로 등은 CC0 라이선스의 무료 에셋(예: Kenney)을 활용하거나 박스로 직접 만든다 |
| 추후 고도화 | AI 이미지→ 3D 도구로 캐릭터 추가 제작, 애니메이션은 Mixamo 등 외부 자원 사용 시 약관을 확인한다 (P2) |
| 성능 규칙 | 그림자 끄기, 단색 머티리얼, 박스 인스턴싱, 라운지 동시 렌더 캐릭터 수 제한 |

## **9\. 기술 스택과 데이터 모델**

웹 우선으로 React Three Fiber 클라이언트, 층 단위 방을 다루는 Colyseus 서버, Supabase 인증·DB로 구성한다.

| 계층 | 선택 | 역할 |
| :---- | :---- | :---- |
| 클라이언트 | React, react-three-fiber, drei, Zustand | 3D 마을, 코드 생성 에셋, 엘리베이터 화면, 2D 소식 패널 UI |
| 실시간 서버 | Colyseus | "빌딩:층:방번호" 단위 방, 위치·이모트·말풍선 동기화, 방 분할 |
| 인증과 DB | Supabase | 로그인, 입주 정보, 층 소식·댓글·신고 저장 |
| 배포 | Vercel(클라이언트), 컨테이너 호스팅(실시간 서버) | 웹 배포와 운영 |

**데이터 모델**

| 테이블 | 주요 필드 | 설명 |
| :---- | :---- | :---- |
| users | id, nickname, created\_at | 로그인 계정과 닉네임 |
| buildings | id, name, floor\_unit, merged\_floor\_max, max\_floor | 종목 빌딩, 층 단위, 통합 저층의 상한 (삼성전자 5, SK하이닉스 100\) |
| residencies | user\_id, building\_id, avg\_price, floor, last\_moved\_at, updated\_at | 입주 정보. avg\_price는 비공개, floor만 노출. last\_moved\_at으로 하루 1회 이동 제한을 검사 |
| news\_posts | id, building\_id, floor, author\_id, body, source\_url, status, created\_at | 층 소식. 같은 building\_id와 floor의 입주민만 열람 |
| reactions | post\_id, user\_id, type | 이모지 반응 |
| comments | id, post\_id, author\_id, body, created\_at | 소식 댓글 |
| reports | id, target\_type, target\_id, reporter\_id, reason, status | 소식·댓글·채팅·유저 신고 |

## **10\. 성공 지표와 MVP 검증**

핵심 지표는 같은 층 사람끼리 실제로 소식을 주고받는지다. 목표치는 베타 1주간 기준선을 측정한 뒤 확정한다.

| 지표 | 정의 | 확인할 것 |
| :---- | :---- | :---- |
| 입주 전환율 | 진입한 사용자 중 평단가를 입력해 입주한 비율 | 입장 흐름이 가볍고 거부감이 없는가 |
| 입주까지 걸린 시간 | 진입부터 층 도착까지 중앙값 | 1분 이내 목표 달성 여부 |
| 소식 작성자 비율 | 일일 접속자 중 소식을 올린 사람의 비율 | 소식 공유 습관이 생기는가 |
| 소식 반응률 | 올라온 소식 중 반응이나 댓글이 달린 비율 | 소식이 실제로 읽히고 공감되는가 |
| 층 대화 참여율 | 입주 후 5분 안에 채팅이나 이모트를 한 비율 | 라운지 소통이 시작되는가 |
| 재방문률 | 7일 내 재접속한 사용자 비율 | 소식이 재방문 이유가 되는가 |
| 층별 활성 분포 | 층별 입주민 수와 소식 수 | 인원이 너무 희소한 층은 인접 층 합치기를 검토 |
| 신고율과 위기 감지 건수 | 소식·채팅 대비 신고 비율, 위기 키워드 감지 건수 | 안전 정책이 작동하는가 |

**MVP 검증 기준**: 층별로 소식이 지속적으로 올라오고 재방문이 유지되면 종목을 늘리고, 소식이 거의 안 올라온다면 소식 작성 진입점(작성 템플릿, 오늘의 질문 등)을 재설계한다.

## **11\. 일정과 마일스톤**

MVP는 5\~6주, 4단계로 진행한다. 핵심은 같은 층의 소식과 대화를 만드는 3단계다.

![MVP 로드맵 · 4단계, 게이트 4개][image1]

MVP 로드맵 · 4단계, 게이트 4개

각 단계의 게이트를 통과해야 다음 단계로 넘어간다.

## **12\. 리스크, 오픈 이슈, 다음 단계**

가장 큰 리스크는 인원이 적은 초기에 층이 비어 소식이 올라오지 않는 것이다.

| 리스크 | 대응 |
| :---- | :---- |
| 초기 인원 부족으로 층이 비어 있음 | 운영자 시드 소식, 작성 템플릿, 인원이 적은 층은 인접 층 합치기 검토 |
| 투자 권유·허위 소식 확산 | 7장 정책, 출시 전 법률 검토, 신고 후 임시 숨김 |
| 폭락장 위기 상황 | F9 위기 키워드 감지와 안내를 출시 조건으로 고정 |
| 평단가 허위 신고 | 층이 소통 단위라 영향은 작지만 하루 1회 이동 제한과 신고로 관리 |
| 3D 성능 | 박스 인스턴싱, 단색 머티리얼, 라운지 인원 상한 |
| 외부 저작권·IP | 오리지널 캐릭터와 CC0 에셋만 사용 |

**오픈 이슈**

* ☐ 통합 저층의 표시 층(제안: 1층)과 통합 층에 인원이 몰리는 정도 확인  
* ☐ 엘리베이터에서 이동 가능한 층의 제한 범위(추가 검토 중)와, 이동 후 층이 평단가 기준 층과 달라지는 경우의 처리  
* ☐ 최초 평단가 입력 이동을 하루 1회 횟수에 포함할지  
* ☐ 소식 열람 범위: MVP는 같은 층 입주민만, 다른 층은 읽기 전용으로 열지 여부  
* ☐ 소식 보존 기간과 삭제 정책  
* ☐ 익명성 수준: 닉네임만 노출할지  
* ☐ 투자자문 규제 검토와 약관 문구  
* ☐ 서비스 이름 확정 (가칭 주식 빌딩 시티)

**다음 단계**: 1단계 프로토타입(박스 빌딩, 박스 캐릭터, 이동) 코드 작성과 층 단위 확정.

[image1]: <data:image/png;base64,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>