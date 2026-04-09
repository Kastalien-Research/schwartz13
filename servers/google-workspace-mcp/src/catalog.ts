interface CatalogEntry {
    name: string
    service: string
    description: string
    example?: string
}

interface CatalogResult {
    tools: CatalogEntry[]
    summary: string
}

const ALL_OPERATIONS: CatalogEntry[] = [
    // --- Gmail ---
    { name: 'gmail.messages.list', service: 'gmail', description: 'List messages in the mailbox. Supports Gmail search query syntax via q parameter.', example: 'google.gmail.users.messages.list({ userId: "me", q: "from:boss@co.com", maxResults: 10 })' },
    { name: 'gmail.messages.get', service: 'gmail', description: 'Get a specific message by ID. Use format "full" for headers+body, "metadata" for headers only.', example: 'google.gmail.users.messages.get({ userId: "me", id: msgId, format: "full" })' },
    { name: 'gmail.messages.send', service: 'gmail', description: 'Send an email. Body must be a base64url-encoded MIME message. Use helpers.createMimeMessage() to build it.', example: 'const raw = helpers.createMimeMessage({ to: "a@b.com", subject: "Hi", body: "Hello" }); google.gmail.users.messages.send({ userId: "me", requestBody: { raw } })' },
    { name: 'gmail.messages.modify', service: 'gmail', description: 'Modify labels on a message. Add or remove label IDs.', example: 'google.gmail.users.messages.modify({ userId: "me", id: msgId, requestBody: { addLabelIds: ["STARRED"], removeLabelIds: ["UNREAD"] } })' },
    { name: 'gmail.messages.trash', service: 'gmail', description: 'Move a message to trash.', example: 'google.gmail.users.messages.trash({ userId: "me", id: msgId })' },
    { name: 'gmail.messages.batchModify', service: 'gmail', description: 'Modify labels on multiple messages at once.', example: 'google.gmail.users.messages.batchModify({ userId: "me", requestBody: { ids: [id1, id2], addLabelIds: ["IMPORTANT"] } })' },
    { name: 'gmail.threads.list', service: 'gmail', description: 'List threads. Supports same query syntax as messages.list.', example: 'google.gmail.users.threads.list({ userId: "me", q: "is:unread", maxResults: 20 })' },
    { name: 'gmail.threads.get', service: 'gmail', description: 'Get a full thread with all messages.', example: 'google.gmail.users.threads.get({ userId: "me", id: threadId, format: "full" })' },
    { name: 'gmail.drafts.create', service: 'gmail', description: 'Create a draft email. Body is base64url-encoded MIME. Use helpers.createMimeMessage().', example: 'const raw = helpers.createMimeMessage({ to: "a@b.com", subject: "Draft", body: "..." }); google.gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } })' },
    { name: 'gmail.drafts.send', service: 'gmail', description: 'Send an existing draft by draft ID.', example: 'google.gmail.users.drafts.send({ userId: "me", requestBody: { id: draftId } })' },
    { name: 'gmail.drafts.delete', service: 'gmail', description: 'Permanently delete a draft.', example: 'google.gmail.users.drafts.delete({ userId: "me", id: draftId })' },
    { name: 'gmail.drafts.list', service: 'gmail', description: 'List all drafts.', example: 'google.gmail.users.drafts.list({ userId: "me" })' },
    { name: 'gmail.labels.list', service: 'gmail', description: 'List all labels in the mailbox.', example: 'google.gmail.users.labels.list({ userId: "me" })' },
    { name: 'gmail.labels.create', service: 'gmail', description: 'Create a new label.', example: 'google.gmail.users.labels.create({ userId: "me", requestBody: { name: "My Label" } })' },
    { name: 'gmail.users.watch', service: 'gmail', description: 'Set up push notifications for mailbox changes via Google Pub/Sub.', example: 'google.gmail.users.watch({ userId: "me", requestBody: { topicName: "projects/my-proj/topics/gmail", labelIds: ["INBOX"] } })' },
    { name: 'gmail.users.getProfile', service: 'gmail', description: 'Get the authenticated user email address and message counts.', example: 'google.gmail.users.getProfile({ userId: "me" })' },
    { name: 'gmail.history.list', service: 'gmail', description: 'List mailbox changes since a given historyId. Used with watch/push notifications.', example: 'google.gmail.users.history.list({ userId: "me", startHistoryId: "12345", historyTypes: ["messageAdded"] })' },

    // --- Calendar ---
    { name: 'calendar.events.list', service: 'calendar', description: 'List events on a calendar. Filter by time range.', example: 'google.calendar.events.list({ calendarId: "primary", timeMin: new Date().toISOString(), maxResults: 10, singleEvents: true, orderBy: "startTime" })' },
    { name: 'calendar.events.get', service: 'calendar', description: 'Get a specific calendar event.', example: 'google.calendar.events.get({ calendarId: "primary", eventId })' },
    { name: 'calendar.events.insert', service: 'calendar', description: 'Create a new calendar event.', example: 'google.calendar.events.insert({ calendarId: "primary", requestBody: { summary: "Meeting", start: { dateTime: "..." }, end: { dateTime: "..." } } })' },
    { name: 'calendar.events.update', service: 'calendar', description: 'Update an existing event.', example: 'google.calendar.events.update({ calendarId: "primary", eventId, requestBody: { summary: "Updated" } })' },
    { name: 'calendar.events.delete', service: 'calendar', description: 'Delete a calendar event.', example: 'google.calendar.events.delete({ calendarId: "primary", eventId })' },
    { name: 'calendar.calendarList.list', service: 'calendar', description: 'List all calendars the user has access to.', example: 'google.calendar.calendarList.list()' },
    { name: 'calendar.freebusy.query', service: 'calendar', description: 'Check free/busy information for calendars.', example: 'google.calendar.freebusy.query({ requestBody: { timeMin: "...", timeMax: "...", items: [{ id: "primary" }] } })' },

    // --- Drive ---
    { name: 'drive.files.list', service: 'drive', description: 'Search and list files. Supports Drive query syntax.', example: 'google.drive.files.list({ q: "name contains \'report\'", pageSize: 10, fields: "files(id,name,mimeType)" })' },
    { name: 'drive.files.get', service: 'drive', description: 'Get file metadata. Use alt:"media" to download content.', example: 'google.drive.files.get({ fileId, fields: "id,name,mimeType,webViewLink" })' },
    { name: 'drive.files.create', service: 'drive', description: 'Create a new file or folder.', example: 'google.drive.files.create({ requestBody: { name: "New Doc", mimeType: "application/vnd.google-apps.document" } })' },
    { name: 'drive.files.update', service: 'drive', description: 'Update file metadata or content.', example: 'google.drive.files.update({ fileId, requestBody: { name: "Renamed" } })' },
    { name: 'drive.files.delete', service: 'drive', description: 'Permanently delete a file.', example: 'google.drive.files.delete({ fileId })' },
    { name: 'drive.files.export', service: 'drive', description: 'Export a Google Workspace file to a different format.', example: 'google.drive.files.export({ fileId, mimeType: "application/pdf" })' },
    { name: 'drive.permissions.create', service: 'drive', description: 'Share a file with a user or group.', example: 'google.drive.permissions.create({ fileId, requestBody: { type: "user", role: "reader", emailAddress: "user@co.com" } })' },

    // --- Docs ---
    { name: 'docs.documents.get', service: 'docs', description: 'Get a Google Doc with full content structure.', example: 'google.docs.documents.get({ documentId })' },
    { name: 'docs.documents.create', service: 'docs', description: 'Create a new Google Doc.', example: 'google.docs.documents.create({ requestBody: { title: "New Doc" } })' },
    { name: 'docs.documents.batchUpdate', service: 'docs', description: 'Apply batch updates (insert text, format, etc.) to a Doc.', example: 'google.docs.documents.batchUpdate({ documentId, requestBody: { requests: [{ insertText: { location: { index: 1 }, text: "Hello" } }] } })' },

    // --- Sheets ---
    { name: 'sheets.spreadsheets.get', service: 'sheets', description: 'Get spreadsheet metadata and sheet properties.', example: 'google.sheets.spreadsheets.get({ spreadsheetId })' },
    { name: 'sheets.spreadsheets.create', service: 'sheets', description: 'Create a new spreadsheet.', example: 'google.sheets.spreadsheets.create({ requestBody: { properties: { title: "New Sheet" } } })' },
    { name: 'sheets.spreadsheets.values.get', service: 'sheets', description: 'Read values from a range.', example: 'google.sheets.spreadsheets.values.get({ spreadsheetId, range: "Sheet1!A1:D10" })' },
    { name: 'sheets.spreadsheets.values.update', service: 'sheets', description: 'Write values to a range.', example: 'google.sheets.spreadsheets.values.update({ spreadsheetId, range: "Sheet1!A1", valueInputOption: "USER_ENTERED", requestBody: { values: [["a","b"],["c","d"]] } })' },
    { name: 'sheets.spreadsheets.values.append', service: 'sheets', description: 'Append rows to a sheet.', example: 'google.sheets.spreadsheets.values.append({ spreadsheetId, range: "Sheet1", valueInputOption: "USER_ENTERED", requestBody: { values: [["new","row"]] } })' },
    { name: 'sheets.spreadsheets.values.batchGet', service: 'sheets', description: 'Read multiple ranges at once.', example: 'google.sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: ["Sheet1!A1:B5", "Sheet2!A1:C3"] })' },

    // --- Slides ---
    { name: 'slides.presentations.get', service: 'slides', description: 'Get a presentation with all slides.', example: 'google.slides.presentations.get({ presentationId })' },
    { name: 'slides.presentations.create', service: 'slides', description: 'Create a new presentation.', example: 'google.slides.presentations.create({ requestBody: { title: "New Deck" } })' },

    // --- Tasks ---
    { name: 'tasks.tasklists.list', service: 'tasks', description: 'List all task lists.', example: 'google.tasks.tasklists.list()' },
    { name: 'tasks.tasks.list', service: 'tasks', description: 'List tasks in a task list.', example: 'google.tasks.tasks.list({ tasklist: tasklistId })' },
    { name: 'tasks.tasks.insert', service: 'tasks', description: 'Create a new task.', example: 'google.tasks.tasks.insert({ tasklist: tasklistId, requestBody: { title: "Do the thing", notes: "Details..." } })' },
    { name: 'tasks.tasks.update', service: 'tasks', description: 'Update a task.', example: 'google.tasks.tasks.update({ tasklist: tasklistId, task: taskId, requestBody: { status: "completed" } })' },
    { name: 'tasks.tasks.delete', service: 'tasks', description: 'Delete a task.', example: 'google.tasks.tasks.delete({ tasklist: tasklistId, task: taskId })' },
]

export function searchCatalog(
    query?: string,
    detail: 'brief' | 'detailed' = 'brief'
): CatalogResult {
    let matched = ALL_OPERATIONS

    if (query) {
        const q = query.toLowerCase()
        matched = ALL_OPERATIONS.filter(
            (t) =>
                t.name.toLowerCase().includes(q) ||
                t.service.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q)
        )
    }

    const tools: CatalogEntry[] = matched.map((t) => {
        if (detail === 'detailed') {
            return { name: t.name, service: t.service, description: t.description, example: t.example }
        }
        return { name: t.name, service: t.service, description: t.description }
    })

    return {
        tools,
        summary: `Showing ${tools.length} of ${ALL_OPERATIONS.length} operations`,
    }
}
