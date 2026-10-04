package earth.hiking.files
import android.content.Context
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
object HikingFiles {
    fun write(context: Context, uri: Uri, text: String) {
        val bytes = text.toByteArray(Charsets.UTF_8)
        if (bytes.size > 5 * 1024 * 1024) throw IllegalArgumentException("文件超过5 MB")
        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes); it.flush() } ?: throw IllegalArgumentException("文件不能写入")
    }
    fun read(context: Context, uri: Uri): String {
        val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer); if (count < 0) break
                if (output.size() + count > 5 * 1024 * 1024) throw IllegalArgumentException("文件超过5 MB")
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: throw IllegalArgumentException("无法打开选中的文件")
        return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
    }
}
