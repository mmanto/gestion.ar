"""
Telegram message handlers
Extracted from main.py to avoid circular imports between main.py and routers.
"""

import os
import tempfile
import logging
from typing import Dict

from fastapi import HTTPException

from app.rag_service import get_rag_service
from app.claude_service import get_llm_service
from app.conversation_service import get_conversation_service
from app.services.client_service import get_client_service

logger = logging.getLogger(__name__)


async def handle_telegram_command(telegram, message_data: Dict) -> Dict:
    """Handle Telegram commands"""

    command = message_data["command"]
    chat_id = message_data["chat_id"]
    user_id = str(message_data["user_id"])

    # Send typing indicator
    await telegram.send_chat_action(chat_id, "typing")

    if command == "/start":
        welcome_text = f"""
🤖 *¡Bienvenido al Bot de WhatsApp RAG!*

Hola {message_data.get('first_name', 'amigo')}! 👋

Soy un asistente inteligente potenciado por Claude AI con Retrieval-Augmented Generation (RAG).

*¿Qué puedo hacer?*
✅ Responder tus preguntas usando una base de conocimiento
✅ Procesar documentos PDF y DOCX que me envíes
✅ Mantener conversaciones contextuales

*Comandos disponibles:*
/start - Ver este mensaje de bienvenida
/help - Obtener ayuda sobre cómo usar el bot
/stats - Ver tus estadísticas de uso

*¿Cómo funciona?*
1. Envíame un mensaje de texto con tu pregunta
2. O envíame un documento PDF/DOCX para agregarlo a mi base de conocimiento
3. ¡Responderé usando inteligencia artificial!

¡Pregúntame lo que quieras! 🚀
"""

        await telegram.send_message(chat_id=chat_id, text=welcome_text)

        # Save conversation
        try:
            conv_service = get_conversation_service()
            await conv_service.log_chat_interaction(
                user_id=user_id,
                user_message="/start",
                assistant_response=welcome_text,
                bot_id=message_data.get("bot_id"),
                client_id=message_data.get("client_id"),
                channel="telegram",
                metadata={"source": "telegram", "command": True}
            )
        except Exception as e:
            logger.warning(f"Error saving conversation: {e}")

    elif command == "/help":
        help_text = """
📚 *Ayuda del Bot*

*Mensajes de texto:*
Simplemente escribe tu pregunta y te responderé usando mi base de conocimiento y Claude AI.

Ejemplo:
"¿Cuál es el horario de atención?"

*Documentos:*
Envíame un archivo PDF o DOCX y lo agregaré a mi base de conocimiento automáticamente. Luego podré responder preguntas sobre ese documento.

Formatos soportados:
📄 PDF (.pdf)
📝 DOCX (.docx)

*Comandos:*
/start - Mensaje de bienvenida
/help - Esta ayuda
/stats - Tus estadísticas de uso

*Límites:*
- Máximo 10 mensajes por minuto
- Los documentos se procesan automáticamente

¿Alguna duda? ¡Pregúntame! 💬
"""

        await telegram.send_message(chat_id=chat_id, text=help_text)

    elif command == "/stats":
        # Get user stats
        try:
            conv_service = get_conversation_service()

            # Get user conversations
            conversations = await conv_service.get_user_conversations(user_id, limit=100)

            total_conversations = len(conversations)
            total_tokens = sum(conv.get("total_tokens_used", 0) for conv in conversations)
            total_cost = sum(conv.get("total_cost_usd", 0.0) for conv in conversations)

            # Count messages
            total_messages = 0
            for conv in conversations:
                total_messages += len(conv.get("messages", []))

            # Get RAG stats
            rag = get_rag_service()
            rag_stats = rag.get_stats()

            stats_text = f"""
📊 *Tus Estadísticas*

*Usuario:* {user_id}
*Nombre:* {message_data.get('first_name', 'N/A')}

*Uso del Bot:*
💬 Conversaciones: {total_conversations}
📝 Mensajes totales: {total_messages}
🔢 Tokens usados: {total_tokens:,}
💰 Costo estimado: ${total_cost:.6f} USD

*Base de Conocimiento:*
📚 Total de chunks: {rag_stats['total_chunks']}
🧠 Dimensión embeddings: {rag_stats['embedding_dimension']}

*Información del Rate Limit:*
"""

            # Add rate limit info
            rate_info = telegram.get_rate_limit_info(chat_id)
            if rate_info["enabled"]:
                stats_text += f"⏱️ Mensajes restantes: {rate_info['remaining']}/{rate_info['limit']}\n"
                stats_text += f"🔄 Se reinicia en: {rate_info['reset_in_seconds']}s\n"

            stats_text += "\n¡Gracias por usar el bot! 🙏"

            await telegram.send_message(chat_id=chat_id, text=stats_text)

        except Exception as e:
            logger.error(f"Error getting stats: {e}")
            await telegram.send_message(
                chat_id=chat_id,
                text="❌ Error obteniendo estadísticas. Intenta de nuevo más tarde."
            )

    else:
        await telegram.send_message(
            chat_id=chat_id,
            text=f"⚠️ Comando no reconocido: {command}\n\nUsa /help para ver los comandos disponibles."
        )

    return {"status": "ok", "message": "Command processed"}


async def handle_telegram_text_message(telegram, message_data: Dict) -> Dict:
    """Handle regular text messages with Claude + RAG"""

    chat_id = message_data["chat_id"]
    user_id = str(message_data["user_id"])
    text = message_data["text"]

    # Send typing indicator
    await telegram.send_chat_action(chat_id, "typing")

    try:
        # Get services
        claude = get_llm_service()
        rag = get_rag_service()

        # Get RAG context
        rag_context = rag.get_context(text, n_results=3)

        # Generate response with Claude
        response = await claude.generate_rag_response(
            user_message=text,
            rag_context=rag_context,
            max_tokens=1024
        )

        # Send response
        await telegram.send_message(
            chat_id=chat_id,
            text=response.response
        )

        # Save conversation
        client_id = message_data.get("client_id")
        bot_id = message_data.get("bot_id")
        try:
            conv_service = get_conversation_service()
            await conv_service.log_chat_interaction(
                user_id=user_id,
                user_message=text,
                assistant_response=response.response,
                bot_id=bot_id,
                client_id=client_id,
                channel="telegram",
                metadata={
                    "model": response.model,
                    "tokens_used": response.tokens_used,
                    "input_tokens": response.input_tokens,
                    "output_tokens": response.output_tokens,
                    "estimated_cost_usd": response.estimated_cost_usd,
                    "rag_used": True,
                    "context_length": len(rag_context),
                    "source": "telegram",
                    "telegram_message_id": message_data["message_id"]
                }
            )
        except Exception as e:
            logger.warning(f"Error saving conversation: {e}")

        # Actualizar contadores del cliente
        if client_id:
            try:
                client_service = get_client_service()
                await client_service.increment_counters(client_id, messages=1)
            except Exception as e:
                logger.warning(f"Error actualizando contadores del cliente Telegram: {e}")

        return {
            "status": "ok",
            "message": "Message processed successfully",
            "tokens_used": response.tokens_used,
            "cost_usd": response.estimated_cost_usd
        }

    except Exception as e:
        logger.error(f"Error processing message: {e}")
        await telegram.send_message(
            chat_id=chat_id,
            text="❌ Lo siento, ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo."
        )
        raise e


async def handle_telegram_document(telegram, message_data: Dict) -> Dict:
    """Handle document uploads (PDF/DOCX) - add to RAG database"""

    chat_id = message_data["chat_id"]
    user_id = str(message_data["user_id"])
    document = message_data["document"]

    # Send upload_document indicator
    await telegram.send_chat_action(chat_id, "upload_document")

    # Check file type
    file_name = document.get("file_name", "")
    mime_type = document.get("mime_type", "")
    file_id = document.get("file_id")
    file_size = document.get("file_size", 0)

    # Validate file type
    if not (file_name.endswith(".pdf") or file_name.endswith(".docx")):
        await telegram.send_message(
            chat_id=chat_id,
            text="⚠️ Solo acepto documentos PDF o DOCX.\n\nFormatos soportados:\n📄 .pdf\n📝 .docx"
        )
        return {"status": "ok", "message": "Unsupported file type"}

    # Check file size (max 20MB)
    if file_size > 20 * 1024 * 1024:
        await telegram.send_message(
            chat_id=chat_id,
            text="⚠️ El archivo es demasiado grande. Máximo: 20MB"
        )
        return {"status": "ok", "message": "File too large"}

    try:
        # Download file
        await telegram.send_message(
            chat_id=chat_id,
            text="📥 Descargando documento..."
        )

        file_path, file_content = await telegram.download_file(file_id)

        # Save to temporary file
        temp_dir = tempfile.gettempdir()
        local_path = os.path.join(temp_dir, file_name)

        with open(local_path, "wb") as f:
            f.write(file_content)

        # Process with RAG service
        await telegram.send_message(
            chat_id=chat_id,
            text="⚙️ Procesando documento..."
        )

        rag = get_rag_service()

        if file_name.endswith(".pdf"):
            chunks_created = rag.add_pdf(local_path, metadata={
                "title": file_name,
                "source": "telegram",
                "uploaded_by": user_id,
                "chat_id": str(chat_id)
            })
        else:  # .docx
            chunks_created = rag.add_docx(local_path, metadata={
                "title": file_name,
                "source": "telegram",
                "uploaded_by": user_id,
                "chat_id": str(chat_id)
            })

        # Clean up temp file
        os.remove(local_path)

        # Send success message
        success_text = f"""
✅ *Documento procesado exitosamente!*

📄 *Archivo:* {file_name}
📊 *Chunks creados:* {chunks_created}
💾 *Tamaño:* {file_size / 1024:.1f} KB

El documento ha sido agregado a mi base de conocimiento. Ahora puedes hacerme preguntas sobre su contenido! 🧠

Ejemplo: "¿De qué trata el documento que acabo de enviar?"
"""

        await telegram.send_message(
            chat_id=chat_id,
            text=success_text
        )

        # Save to conversation history
        try:
            conv_service = get_conversation_service()
            await conv_service.log_chat_interaction(
                user_id=user_id,
                user_message=f"[Documento subido: {file_name}]",
                assistant_response=success_text,
                bot_id=message_data.get("bot_id"),
                client_id=message_data.get("client_id"),
                channel="telegram",
                metadata={
                    "source": "telegram",
                    "document_upload": True,
                    "file_name": file_name,
                    "chunks_created": chunks_created,
                    "file_size": file_size
                }
            )
        except Exception as e:
            logger.warning(f"Error saving conversation: {e}")

        return {
            "status": "ok",
            "message": "Document processed successfully",
            "chunks_created": chunks_created
        }

    except Exception as e:
        logger.error(f"Error processing document: {e}")

        # Clean up temp file if exists
        if 'local_path' in locals() and os.path.exists(local_path):
            os.remove(local_path)

        await telegram.send_message(
            chat_id=chat_id,
            text=f"❌ Error procesando documento: {str(e)}\n\nPor favor, intenta de nuevo."
        )
        raise HTTPException(500, f"Error processing document: {str(e)}")
