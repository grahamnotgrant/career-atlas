# Personal data and sharing

Career Atlas stores canonical application records in local SQLite. Private files include resumes, application answers, job descriptions, receipts, source messages, facts, source registries, session notes, settings, exports and backups. Keep the data directory outside the Git checkout. Resolve existing facts and session pointers before using the default `DATA/evidence/facts.md`; do not create competing evidence stores.

The app binds to `127.0.0.1`. Its control token grants local access to personal records. Do not print it, paste it into chat or a URL, commit it or expose the server through a public tunnel. The app does not need a cloud account to store or visualize records.

The Work screen keeps an exact pending workspace request in this browser's local storage until the server confirms it. That request can contain an answer or instruction; it contains no control token. This supports safe same-ID retry after a connection failure or reload. Unsaved form edits remain in the open page, while submitted records and their audit history live in SQLite.

An external AI provider receives the text and files that you or its tools send into that conversation. Local storage does not prevent that sharing. Read only authorized sources needed for the task, including work repositories or connected accounts; do not upload a full personal folder to simplify a question. Keep source access, observations, human or agent ownership and approval of external wording distinct. Keep detailed source authorization/notes private and publish only relevant checked-through coverage through the supported workspace source records.

Employers receive the specific application fields and documents submitted to their systems. They may retain them under their own policies. An application grant authorizes only its stated scope. Agent access to a browser does not authorize unrelated messages, purchases or account changes. `WORKFLOW-CONTRACTS.md` defines when existing authorization covers maintenance and when new claims, sensitive answers, outreach or expanded permissions require user input.

The app generates Excel and JSON exports from SQLite. They contain personal data and can include sensitive notes, agent instructions, exact question answers and wording approvals. Backups contain local records and evidence but omit the control token, runtime logs and derived exports. Workspace source/material references outside the managed data directory remain external references; backup does not copy arbitrary referenced files. Encrypt the backup location using your operating system or a storage tool you trust; the backup directory itself is not encrypted by Career Atlas.

Delete a local installation by stopping it and removing the chosen data folder, exports and backups you no longer want. Deleting local files does not delete employer submissions or copies shared with an AI provider.
