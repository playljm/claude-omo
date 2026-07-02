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

REM ── 1. 검증 ─────────────────────────────────────────────────────
echo [1/4] 검증...
if exist "%REPO_DIR%\mcp-server\package.json" (
    pushd "%REPO_DIR%\mcp-server"
    call npm ci
    if errorlevel 1 (
        popd
        echo [오류] npm ci 실패
        pause
        exit /b 1
    )
    call npm test
    if errorlevel 1 (
        popd
        echo [오류] npm test 실패
        pause
        exit /b 1
    )
    call npm run selftest
    if errorlevel 1 (
        popd
        echo [오류] selftest 실패
        pause
        exit /b 1
    )
    call npm audit --omit=dev
    if errorlevel 1 (
        popd
        echo [오류] npm audit 실패
        pause
        exit /b 1
    )
    popd
)

where bash >nul 2>&1
if not errorlevel 1 (
    call bash -n "%REPO_DIR%\install.sh"
    if errorlevel 1 (
        echo [오류] install.sh 문법 검증 실패
        pause
        exit /b 1
    )
) else (
    echo   bash 없음 - install.sh 정적 검증 건너뜀
)

REM ── 2. 프로젝트 레벨 배포 (C:\dev\.claude\) ─────────────────
echo.
echo [2/4] C:\dev\.claude\ 동기화 중...

if not exist "%PROJ_CLAUDE%\agents" mkdir "%PROJ_CLAUDE%\agents"
if not exist "%PROJ_CLAUDE%\commands" mkdir "%PROJ_CLAUDE%\commands"

xcopy /Y /Q "%REPO_DIR%\agents\*.md" "%PROJ_CLAUDE%\agents\" >nul
xcopy /Y /Q "%REPO_DIR%\commands\*.md" "%PROJ_CLAUDE%\commands\" >nul
echo   agents + commands 동기화 완료

REM ── 3. 글로벌 배포 (기존 파일만 업데이트, MCP 등록 제외) ─────
echo.
echo [3/4] %GLOBAL_CLAUDE%\ 동기화 중...

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

REM ── 4. Git 커밋 & Push ────────────────────────────────────────
echo.
echo [4/4] GitHub push...
cd /d "%REPO_DIR%"
git add -- .github agents commands skills mcp-server CHANGELOG.md CLAUDE.md README.md TROUBLESHOOT.md WINDOWS_FIXES.md install.sh update.bat
if errorlevel 1 (
    echo [오류] stage 실패
    pause
    exit /b 1
)

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
echo   done  - 검증 + sync + push 완료!
echo   (MCP 서버 변경 시 Claude Code 재시작 필요)
echo ========================================================
timeout /t 3
