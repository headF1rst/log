# MedPath Connect: 의료 전문가 커뮤니케이션 플랫폼

MedPath Connect는 의료 전문가들이 소통하고, 병리학 사례를 공유하며, 의학 정보를 교환할 수 있는 플랫폼입니다. 이 프로젝트는 Next.js의 점진적 정적 재생성(ISR)과 React Query의 Hydration 기능을 사용하여 고성능 웹 애플리케이션을 만드는 방법을 보여줍니다.

## 프로젝트 개요

MedPath Connect는 의료 전문가들에게 다음과 같은 기능을 제공합니다:

- 병리학 사례 공유 및 토론
- 의학 자원 및 연구 자료 접근
- 진단에 대한 동료들과의 협업
- 최신 의학 정보 업데이트

이 플랫폼은 다음 사항에 중점을 두고 구축되었습니다:

- 모듈식 코드 구성 및 높은 코드 품질
- 쉬운 탐색을 위한 명확한 디렉토리 구조
- 타입 안전성을 위한 적절한 TypeScript 사용
- ISR 및 React Query를 통한 성능 최적화
- 핵심 기능에 집중한 깔끔하고 읽기 쉬운 코드

## 기술적 특징

### 점진적 정적 재생성(ISR)

ISR을 통해 배포 후에도 전체 사이트를 다시 빌드하지 않고 정적 페이지를 업데이트할 수 있습니다. 이는 다음과 같은 이점을 제공합니다:

- 빠른 초기 페이지 로드(정적 생성)
- 신선한 콘텐츠(주기적 재생성)
- 우수한 SEO(사전 렌더링된 HTML)

### React Query와 Hydration

이 프로젝트는 React Query의 Hydrate 기능을 사용하여:

- 정적 생성 중 서버에서 데이터 미리 가져오기
- 중복 요청을 방지하기 위해 클라이언트에서 데이터 하이드레이션
- 캐시 무효화 및 재요청 관리
- 로딩 및 오류 상태 제공

## 프로젝트 구조

```
├── components/           # 재사용 가능한 UI 컴포넌트
│   ├── dashboard/        # 대시보드 관련 컴포넌트
│   └── layout/           # 레이아웃 컴포넌트(헤더, 푸터)
│
├── hooks/                # 커스텀 React 훅
│   └── useQueryHooks.ts  # 데이터 가져오기를 위한 React Query 훅
│
├── lib/                  # 라이브러리 코드
│   ├── api/              # API 서비스 및 목업 데이터
│   └── react-query/      # React Query 설정 및 하이드레이션
│
├── pages/                # Pages 라우터
│   ├── index.tsx         # 대시보드 페이지
│   └── pathology-cases/  # 병리학 사례 페이지
│
├── types/                # TypeScript 타입 정의
│
├── utils/                # 유틸리티 함수
│
├── next.config.js        # Next.js 설정
├── package.json          # 프로젝트 의존성
└── tsconfig.json         # TypeScript 설정
```

## 주요 구현 세부사항

### ISR 구현

ISR은 Pages 라우터에서 `getStaticProps`와 `revalidate` 속성을 사용하여 구현됩니다:

```typescript
export const getStaticProps: GetStaticProps = async () => {
  // React Query를 사용하여 여기서 데이터 가져오기
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery([queryKeys.data], fetchData);

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
    // 5분마다 재검증
    revalidate: 300,
  };
};
```

### React Query Hydration

React Query의 Hydrate 기능은 서버에서 가져온 데이터를 클라이언트에서 재사용하는 데 사용됩니다:

1. 서버에서 `queryClient.prefetchQuery`를 사용하여 데이터 미리 가져오기
2. `dehydrate(queryClient)`를 사용하여 쿼리 캐시 탈수화
3. 탈수화된 상태를 페이지에 props로 전달
4. 클라이언트는 `<Hydrate>` 컴포넌트를 사용하여 캐시 수화
5. 컴포넌트는 React Query 훅을 사용하여 데이터를 다시 가져오지 않고 액세스 가능

```javascript
// 서버 측 getStaticProps에서
const queryClient = new QueryClient();
await queryClient.prefetchQuery(['key'], fetchData);
const dehydratedState = dehydrate(queryClient);

return {
  props: {
    dehydratedState,
  },
  revalidate: 300,
};

// 클라이언트 측 _app.tsx에서
import { ReactQueryProvider } from '../lib/react-query/provider';

function MyApp({ Component, pageProps }) {
  // ReactQueryProvider 컴포넌트는 앱을 감싸고
  // 수화된 쿼리 클라이언트를 모든 컴포넌트에 제공합니다
  return (
    // pageProps에서 dehydratedState를 가진 ReactQueryProvider가
    // pageProps와 함께 Component를 감싸고 있습니다
    // 이 구조는 React Query 하이드레이션을 가능하게 합니다
    "JSX 구조로 ReactQueryProvider가 Component를 감싸고 있음"
  );
}
```

## 데이터 흐름

1. **빌드 시간 / 재검증**: 데이터가 가져와지고 페이지가 생성됩니다
2. **클라이언트 요청**: 정적 HTML이 즉시 제공됩니다
3. **하이드레이션**: React Query가 서버에서 가져온 데이터를 클라이언트에서 수화합니다
4. **상호작용**: 사용자가 데이터와 상호작용하고, React Query가 캐시를 관리합니다
5. **재검증**: 재검증 기간 후 백그라운드에서 페이지가 재생성됩니다

## 시작하기

1. 의존성 설치:
   ```
   npm install
   ```

2. 개발 서버 실행:
   ```
   npm run dev
   ```

3. 프로덕션용 빌드:
   ```
   npm run build
   ```

4. 프로덕션 서버 시작:
   ```
   npm start
   ```

## ISR 및 Hydration 테스트

ISR 및 Hydration 기능을 테스트하려면:

1. 프로젝트 빌드: `npm run build`
2. 프로덕션 서버 시작: `npm start`
3. 브라우저의 개발자 도구에서 Network 탭 열기
4. 대시보드 또는 병리학 사례 페이지 방문
5. 클라이언트에서 데이터가 다시 가져와지지 않는 것 확인(하이드레이션됨)
6. 재검증 기간(5분) 대기
7. 페이지를 새로고침하여 업데이트된 콘텐츠 확인

## 더 알아보기

- [Next.js ISR 문서](https://nextjs.org/docs/basic-features/data-fetching/incremental-static-regeneration)
- [React Query 문서](https://tanstack.com/query/latest/docs/react/overview)
- [React Query Hydration](https://tanstack.com/query/latest/docs/react/guides/ssr)
