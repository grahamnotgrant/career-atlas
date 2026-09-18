# Personal data and sharing

Career Atlas stores canonical records in local SQLite. Private files include resumes, application answers, job descriptions, receipts, source messages, session notes, settings, exports and backups. Keep the data directory outside the Git checkout.

The app binds to `127.0.0.1`. Its control token grants local access to personal records. Do not print it, paste it into chat, commit it or expose the server through a public tunnel. The app does not need a cloud account to store or visualize records.

An external AI provider receives the text and files that you or its tools send into that conversation. Local storage does not prevent that sharing. Read only the files needed for the task; do not upload a full personal folder to simplify a question.

Employers receive the specific application fields and documents submitted to their systems. They may retain them under their own policies. An application grant authorizes only its stated scope. Agent access to a browser does not authorize unrelated messages, purchases or account changes.

The app generates Excel and JSON exports from SQLite. They contain personal data and can include sensitive notes. Backups contain local records and evidence but omit the control token, runtime logs and derived exports. Encrypt the backup location using your operating system or a storage tool you trust; the backup directory itself is not encrypted by Career Atlas.

Delete a local installation by stopping it and removing the chosen data folder, exports and backups you no longer want. Deleting local files does not delete employer submissions or copies shared with an AI provider.
