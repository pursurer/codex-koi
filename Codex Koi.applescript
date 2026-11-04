-- Codex Koi: opens Codex (ChatGPT.app) with the ASCII Koi pond on its new-chat page.
-- If Codex is already open it only brings it forward: no prompts, no restarts.
set koiScript to (POSIX path of (path to home folder)) & "Projects/codex-koi/codex-koi.sh"
if (do shell script "/bin/bash " & quoted form of koiScript & " status") is "off" then
	do shell script "/bin/bash " & quoted form of koiScript & " start"
else
	tell application id "com.openai.codex" to activate
end if
