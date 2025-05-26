import com.asana.Client
import org.kohsuke.github.GitHub
import org.kohsuke.github.GHEventPayload
import kotlinx.coroutines.runBlocking
import java.io.File

object AsanaSync {
    private val asanaToken = System.getenv("ASANA_ACCESS_TOKEN")
    private val githubToken = System.getenv("GITHUB_TOKEN")
    private val workspaceId = System.getenv("ASANA_WORKSPACE_ID")
    private val projectId = System.getenv("ASANA_PROJECT_ID")

    private val asanaClient = Client.accessToken(asanaToken)
    private val github = GitHub.connectUsingOAuth(githubToken)

    fun syncPullRequest() = runBlocking {
        val eventPath = System.getenv("GITHUB_EVENT_PATH")
        val eventFile = File(eventPath)
        val event = github.parseEventPayload(eventFile.reader(), GHEventPayload.PullRequest::class.java)

        val pr = event.pullRequest
        val title = pr.title
        val url = pr.htmlUrl.toString()

        // Create task data
        val taskFields = listOf(
            "name",
            "notes",
            "workspace",
            "projects.gid"
        )

        // Create or update Asana task
        val task = asanaClient.tasks.createTask()
            .data("name", title)
            .data("notes", "PR URL: $url")
            .data("workspace", workspaceId)
            .data("projects", listOf(projectId))
            .option("fields", taskFields)
            .execute()

        println("Created/Updated Asana task: ${task.gid}")
    }
}

fun main() {
    try {
        AsanaSync.syncPullRequest()
    } catch (e: Exception) {
        System.err.println("Error: ${e.message}")
        e.printStackTrace()
        System.exit(1)
    }
} 