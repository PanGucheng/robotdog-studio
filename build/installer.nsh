!include "x64.nsh"

!macro customInstall
  DetailPrint "正在安装 WCH-Link 驱动..."
  IfFileExists "$INSTDIR\resources\toolchains\wch\drivers\WCHLinkDrv\WCHLinkWDM.INF" 0 inf_missing
  ${If} ${RunningX64}
    StrCpy $R9 "$WINDIR\Sysnative\pnputil.exe"
  ${Else}
    StrCpy $R9 "$SYSDIR\pnputil.exe"
  ${EndIf}
  IfFileExists "$R9" 0 pnputil_missing
  ExecWait '"$R9" /add-driver "$INSTDIR\resources\toolchains\wch\drivers\WCHLinkDrv\WCHLinkWDM.INF" /install' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "WCH-Link 驱动安装失败（pnputil 退出码：$0）。$\n请检查驱动文件是否完整，或手动安装驱动后重试。"
    Abort "WCH-Link 驱动安装失败"
  ${EndIf}
  DetailPrint "WCH-Link 驱动安装成功。"
  Goto done
  inf_missing:
    MessageBox MB_ICONSTOP "安装包内未找到 WCH-Link 驱动文件 WCHLinkWDM.INF，安装无法继续。"
    Abort "缺少 WCH-Link 驱动 INF"
  pnputil_missing:
    MessageBox MB_ICONSTOP "系统未找到 pnputil.exe，无法安装 WCH-Link 驱动。$\n请确认 Windows 系统组件完整。"
    Abort "缺少 pnputil.exe"
  done:
!macroend
