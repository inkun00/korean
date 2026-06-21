# 애국가 음원 연결

사용 권리가 확인된 애국가 음원을 이 폴더에 `aegukga.mp3`라는 이름으로 배치하면 MP4 렌더러가 자동으로 사용합니다.

다른 경로를 사용하려면 서버 실행 전에 `AEGUKGA_AUDIO_PATH` 환경변수를 설정합니다.

```powershell
$env:AEGUKGA_AUDIO_PATH = "C:\media\aegukga.mp3"
npm start
```

음원 파일은 저장소에 커밋하지 않습니다.
