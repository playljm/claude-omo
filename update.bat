@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion

set REPO_DIR=C:\dev\claude-omo
set PROJ_CLAUDE=C:\dev\.claude
set GLOBAL_CLAUDE=%USERPROFILE%\.claude

echo.
echo ========================================================
echo   claude-omo  ^|  sync + push
echo ========================================================
echo.

REM ── 1. 프로젝트 레벨 배포 (C:\dev\.claude\) ─────────────────
echo [1/3] C:\dev\.claude\ 동기화 중...

if not exist "%PROJ_CLAUDE%\agents" mkdir "%PROJ_CLAUDE%\agents"
if not exist "%PROJ_CLAUDE%\commands" mkdir "%PROJ_CLAUDE%\commands"

xcopy /Y /Q "%REPO_DIR%\agents\*.md" "%PROJ_CLAUDE%\agents\" >nul
xcopy /Y /Q "%REPO_DIR%\commands\*.md" "%PROJ_CLAUDE%\commands\" >nul
echo   agents + commands 동기화 완료

REM ── 2. 글로벌 배포 (기존 파일만 업데이트, MCP 등록 제외) ─────
echo.
echo [2/3] %GLOBAL_CLAUDE%\ 동기화 중...

if exist "%GLOBAL_CLAUDE%\agents" (
    xcopy /Y /Q "%REPO_DIR%\agents\*.md" "%GLOBAL_CLAUDE%\agents\" >nul
    echo   agents 동기화 완료
)
if exist "%GLOBAL_CLAUDE%\commands" (
    xcopy /Y /Q "%REPO_DIR%\commands\*.md" "%GLOBAL_CLAUDE%\commands\" >nul
    echo   commands 동기화 완료
)
if exist "%GLOBAL_CLAUDE%\skills" (
    xcopy /Y /Q /E /I "%REPO_DIR%\skills" "%GLOBAL_CLAUDE%\skills" >nul
    echo   skills 동기화 완료
)

REM CLAUDE.md 업데이트 여부 확인
fc /b "%REPO_DIR%\CLAUDE.md" "%GLOBAL_CLAUDE%\CLAUDE.md" >nul 2>&1
if errorlevel 1 (
    echo   CLAUDE.md 변경 감지 - 업데이트
    copy /Y "%REPO_DIR%\CLAUDE.md" "%GLOBAL_CLAUDE%\CLAUDE.md" >nul
) else (
    echo   CLAUDE.md 변경 없음
)

REM ── 3. Git 커밋 & Push ────────────────────────────────────────
echo.
echo [3/3] GitHub push...
cd /d "%REPO_DIR%"
git add -A

git diff --cached --quiet
if not errorlevel 1 (
    echo   변경사항 없음 - push 불필요
    echo.
    echo ========================================================
    echo   done  (변경사항 없음)
    echo ========================================================
    timeout /t 3
    exit /b 0
)

echo.
echo 변경된 파일:
git diff --cached --name-only
echo.

REM 날짜 계산
powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HHmm'" > "%TEMP%\omo_dt.txt" 2>nul
set /p DT=<"%TEMP%\omo_dt.txt"
del "%TEMP%\omo_dt.txt" 2>nul

set /p MSG="커밋 메시지 (엔터=자동): "
if "!MSG!"=="" set MSG=sync: !DT!

git commit -m "!MSG!"
if errorlevel 1 (
    echo [오류] 커밋 실패
    pause
    exit /b 1
)

git push origin master
if errorlevel 1 (
    echo [오류] push 실패. 네트워크 또는 인증 확인
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   done  - sync + push 완료!
echo   (MCP 서버 변경 시 Claude Code 재시작 필요)
echo ========================================================
timeout /t 3
