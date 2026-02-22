; DMXGram Online Installer (Stub)
; Pobiera zawsze najnowsza wersje z GitHub Releases

Unicode true

!define APP_NAME "DMXGram"
!define GITHUB_API "https://api.github.com/repos/prodorzech/dmxgram/releases/latest"

Name "${APP_NAME} Installer"
OutFile "..\stub-dist\DMXGram-Install.exe"
RequestExecutionLevel user
ShowInstDetails show
InstallDir "$TEMP\DMXGram"

; Modern UI
!include "MUI2.nsh"

!define MUI_ICON "..\dist\.icon-ico\icon.ico"
!define MUI_HEADERIMAGE
!define MUI_ABORTWARNING
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Instalacja zakonczona"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "DMXGram zostal zainstalowany."

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Polish"

Section "Download & Install" SecMain
  SetOutPath "$TEMP\DMXGram"

  DetailPrint "Pobieranie najnowszej wersji DMXGram..."

  ; PowerShell script to fetch latest release and download installer
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "\
    try { \
      Add-Type -AssemblyName System.Net.Http; \
      $wc = New-Object System.Net.WebClient; \
      $wc.Headers.Add(''User-Agent'', ''DMXGram-Downloader''); \
      $json = $wc.DownloadString(''${GITHUB_API}''); \
      $tag = [regex]::Match($json, ''\"tag_name\":\s*\"([^\"]+)\"'').Groups[1].Value; \
      $ver = $tag.TrimStart(''v''); \
      $url = ''https://github.com/prodorzech/dmxgram/releases/download/'' + $tag + ''/DMXGram-Setup-'' + $ver + ''.exe''; \
      $out = ''$TEMP\DMXGram\DMXGram-Setup.exe''; \
      $wc2 = New-Object System.Net.WebClient; \
      $wc2.DownloadFile($url, $out); \
      Write-Output ''OK'' \
    } catch { \
      Write-Output (''ERROR: '' + $_.Exception.Message) \
    }"'

  Pop $0 ; exit code
  Pop $1 ; output

  ; Check result
  StrCpy $2 $1 2
  StrCmp $2 "OK" launch 0

  MessageBox MB_OK|MB_ICONEXCLAMATION "Blad pobierania: $1"
  Quit

  launch:
  DetailPrint "Uruchamianie instalatora..."
  ExecWait '"$TEMP\DMXGram\DMXGram-Setup.exe"'

  ; Cleanup
  Delete "$TEMP\DMXGram\DMXGram-Setup.exe"
  RMDir "$TEMP\DMXGram"
SectionEnd
