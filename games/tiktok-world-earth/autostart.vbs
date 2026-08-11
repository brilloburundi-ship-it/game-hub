Option Explicit

Dim shell, fso, root, quote, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
quote = Chr(34)
command = "cmd.exe /d /c " & quote & quote & root & "\AVVIA GIOCO.bat" & quote & " --no-open" & quote
shell.Run command, 0, False
