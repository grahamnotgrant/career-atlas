# Career Atlas — Product specification

**Tagline:** *Track every application. Give your AI the context to help you move forward.*

## Product and distribution

Career Atlas is an open-source, local application that helps anyone understand and improve their job search, across professions and experience levels.

The user gives its public GitHub link to **Codex or Claude**. Their AI downloads the software, sets it up locally and conducts onboarding in that conversation. GitHub distributes the code and agent instructions; personal records stay on the user’s computer.

Career Atlas provides the interactive visual. Users ask their external AI questions, and the AI reads the underlying records, explains findings and changes the visual through the local control interface.

## Portable agent skills

Bundle our own skills, usable by Codex and Claude without prior conversation history:

1. **Discover direction:** a Wayfinder-style session uncovering goals, constraints, overlooked experience and unknowns. Resolve questions within the session; save progress for interruptions.
2. **Critique the resume:** assess the existing resume against desired roles, identifying weak wording, missing evidence, unclear claims and formatting problems.
3. **Uncover evidence:** a Grillme-style session probing personal ownership, implementation details, decisions and outcomes.
4. **Build role templates:** create truthful, ATS-compatible resume templates for distinct target role families.
5. **Run the search:** coordinate scouting, tailoring, applying and tracking.
6. **Review and improve:** analyze outcomes and conduct focused follow-up sessions.

Each skill defines inputs, local outputs, approval gates and completion checks. **Bundled Stop Slop instructions are mandatory for all writing on the user’s behalf.**

## Onboarding and settings

The AI suggests a local storage folder and creates the required files.

Establish:

- Experience, evidence and career goals.
- Target roles, compensation floors, locations and work arrangements.
- Exclusions and application preferences.
- Approved resume templates and application authorization boundaries.
- Available browser, spreadsheet, integration and agent capabilities.

These settings remain editable in Career Atlas and readable by the agents. Support a single-agent fallback.

Identify up to **20 evidence-backed target role types**, ranked by fit and preferences.

## Resumes and application tailoring

Every application receives its own tailored resume and answers, derived from approved templates and supported experience.

The applying agent must:

- Read the full job description.
- Select and emphasize relevant accomplishments.
- Use accurate role terminology without inventing qualifications, metrics or ownership.
- Apply Stop Slop to remove filler, generic phrasing and repetitive AI-style writing.
- Check factual consistency, extractable text, reading order and ATS-compatible formatting.
- Preserve the exact submitted materials.

New or unsupported factual claims require user confirmation. ATS compatibility and strong writing are goals, not guarantees of selection or avoiding AI detection.

## Approval gates

Users approve:

1. **Resume templates and material changes to their claims or positioning.**
2. **Individual applications or batches**, bounded by roles, compensation, locations and exclusions.

Users can pause or revoke authorization. Sensitive or unsupported answers require their input.

## Agent workflow

**Primary agent**

- Maintains evidence, preferences and the search plan.
- Scouts and screens opportunities.
- Coordinates the applying agent.
- Reconciles interview requests, rejections and offers through authorized sources.
- Reviews results with the user.

**Applying agent**

- Claims an eligible application.
- Tailors its resume and answers.
- Completes the application and captures confirmation.
- Attempts available CAPTCHA interactions; if blocked, preserves progress and asks the user to complete the step, then resumes.

Agents consult the tracker before applying. The local system uses exclusive application claims to prevent simultaneous duplicate submissions. Uncertain submission outcomes must be reconciled before retrying.

Track repeat applications to each company, including distinct roles, dates and outcomes.

## Local records and Excel

Maintain one canonical local dataset with an Excel workbook reflecting the same records.

Track:

- Discovered, prepared, attempted, blocked and confirmed-submitted applications.
- Company, original job title, normalized role family and location.
- Job description, tailored resume version, application answers and confirmation receipt.
- Interview requests and stages, rejections, withdrawals and offers.
- Employer feedback, user-reported information and hypotheses as distinct evidence types.

Count submissions only after confirmation. Silence remains awaiting response.

Support backup, export, restore and software updates that preserve personal files. Explain what information external AI providers and employers receive.

## Visualization and role coverage

Retain the interactive application journey visual, linked to local records and documents.

Add **“Your top 20 roles”**:

- Compare target role types against actual application activity.
- Show application, awaiting-response, interview, rejection and offer counts.
- Click a role family to highlight its journeys and inspect matching applications.
- Preserve original employer titles and show unmatched roles separately.
- Expose company-level application history and counts.

## Improvement loop

Compare outcomes by role family and resume version, accounting for applications still awaiting responses. Use supported findings to improve targeting, resumes and interview preparation.

Weak spots trigger focused evidence-gathering or Grillme-style sessions. Clearly distinguish explicit employer feedback from possible explanations.