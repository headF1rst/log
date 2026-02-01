#!/bin/bash

# 현재 디렉토리를 프로젝트 루트로 변경
cd "$(dirname "$0")/.."

# 변경사항 확인
git_status=$(git status --porcelain)
has_changes=false

# _posts 디렉토리에 변경사항이 있는지 확인
if echo "$git_status" | grep -q "_posts/"; then
  has_changes=true
fi

# 변경사항이 있으면 빌드 및 사이트맵 업데이트
if [ "$has_changes" = true ]; then
  echo "콘텐츠 변경이 감지되었습니다. 사이트맵을 업데이트합니다..."
  
  # 빌드 실행
  npm run build
  
  echo "사이트맵이 성공적으로 업데이트되었습니다."
else
  echo "콘텐츠 변경이 없습니다. 사이트맵 업데이트가 필요하지 않습니다."
fi
