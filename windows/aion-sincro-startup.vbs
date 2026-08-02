' ============================================================
' Aion Sincro — Arranque silencioso para inicio de Windows
' ============================================================
' Este script lo ejecuta el acceso directo en la carpeta Startup.
' Llama a aion-sincro.cmd con AION_STARTUP=1 para que los servicios
' (web + puente + Piper) arranquen en segundo plano sin abrir el
' navegador ni mostrar ventanas de consola.
'
' Mantenlo junto a aion-sincro.cmd en la carpeta windows\.
' ============================================================

Option Explicit

Dim WshShell, appDir, launcher, iconFile, rc

Set WshShell = CreateObject("WScript.Shell")

' La carpeta donde está este .vbs (windows\) — el .cmd está aquí
' Usamos ScriptFullName (no CurrentDirectory) para que funcione
' aunque el proceso que lo lance tenga otro directorio de trabajo.
Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
If Right(appDir, 1) <> "\" Then appDir = appDir & "\"

launcher = appDir & "aion-sincro.cmd"

' Verificar que el launcher existe
If Not fso.FileExists(launcher) Then
    ' Buscar en el padre (modo repo: este .vbs en windows\, cmd también)
    launcher = fso.GetParentFolderName(appDir)
    If Right(launcher, 1) <> "\" Then launcher = launcher & "\"
    launcher = launcher & "aion-sincro.cmd"
    If Not fso.FileExists(launcher) Then
        ' No se encontró — salir silenciosamente
        WScript.Quit 1
    End If
    ' Cambiar el directorio de trabajo al padre
    appDir = fso.GetParentFolderName(appDir)
    If Right(appDir, 1) <> "\" Then appDir = appDir & "\"
End If

' Arrancar el .cmd con AION_STARTUP=1 (sin navegador, sin timeout)
' WindowStyle 0 = oculto, False = no esperar a que termine
Dim env : Set env = WshShell.Environment("Process")
env("AION_STARTUP") = "1"

rc = WshShell.Run("cmd /c """ & launcher & """", 0, False)

WScript.Quit rc
