"""
WhatsApp Webhook Router
Maneja webhooks de WhatsApp para múltiples proveedores (Meta, Twilio, etc.)
"""

import json
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, Request, HTTPException, Header, Form
from fastapi.responses import PlainTextResponse

from app.services.channel_service import get_channel_service
from app.services.client_service import get_client_service
from app.models.channel import ChannelType, WhatsAppProvider
from app.providers import get_whatsapp_provider, ParsedMessage
from app.rag_service import get_rag_service
from app.claude_service import get_llm_service
from app.conversation_service import get_conversation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhook/whatsapp", tags=["WhatsApp Webhooks"])


async def process_whatsapp_message(
    parsed_message: ParsedMessage,
    channel_id: str,
    provider_name: str,
    bot_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Procesa un mensaje de WhatsApp usando Claude + RAG.

    Args:
        parsed_message: Mensaje parseado del webhook
        channel_id: ID del canal
        provider_name: Nombre del proveedor
        bot_id: ID del bot asociado al canal

    Returns:
        Resultado del procesamiento
    """
    try:
        # Obtener servicios
        claude = get_llm_service()
        rag = get_rag_service()
        channel_service = get_channel_service()

        # Registrar o recuperar cliente
        client_id: Optional[str] = None
        if bot_id:
            try:
                client_service = get_client_service()
                client = await client_service.get_or_create_client(
                    bot_id=bot_id,
                    external_id=parsed_message.from_number,
                    source="whatsapp",
                )
                client_id = client.client_id
            except Exception as e:
                logger.warning(f"Error registrando cliente WhatsApp: {e}")

        # Obtener contexto RAG
        rag_context = ""
        if parsed_message.text:
            rag_context = rag.get_context(parsed_message.text, n_results=3)

        # Generar respuesta con Claude
        response = await claude.generate_rag_response(
            user_message=parsed_message.text or "[Mensaje no textual]",
            rag_context=rag_context,
            max_tokens=1024
        )

        # Guardar conversación
        try:
            conv_service = get_conversation_service()
            await conv_service.log_chat_interaction(
                user_id=parsed_message.from_number,
                user_message=parsed_message.text or "[Mensaje no textual]",
                assistant_response=response.response,
                bot_id=bot_id,
                client_id=client_id,
                channel="whatsapp",
                metadata={
                    "model": response.model,
                    "tokens_used": response.tokens_used,
                    "input_tokens": response.input_tokens,
                    "output_tokens": response.output_tokens,
                    "estimated_cost_usd": response.estimated_cost_usd,
                    "rag_used": bool(rag_context),
                    "context_length": len(rag_context),
                    "whatsapp_message_id": parsed_message.message_id,
                    "source": "whatsapp",
                    "provider": provider_name,
                    "channel_id": channel_id
                }
            )
        except Exception as e:
            logger.warning(f"Error guardando conversación: {e}")

        # Actualizar contadores del cliente
        if client_id:
            try:
                client_service = get_client_service()
                await client_service.increment_counters(client_id, messages=1)
            except Exception as e:
                logger.warning(f"Error actualizando contadores del cliente: {e}")

        # Actualizar contadores del canal
        try:
            await channel_service.increment_message_counters(channel_id, received=1, sent=1)
        except Exception as e:
            logger.warning(f"Error actualizando contadores: {e}")

        return {
            "response_text": response.response,
            "tokens_used": response.tokens_used,
            "cost_usd": response.estimated_cost_usd
        }

    except Exception as e:
        logger.error(f"Error procesando mensaje: {e}")
        raise


# ==================== WEBHOOKS META ====================

@router.get("/meta/{channel_id}", response_class=PlainTextResponse)
async def verify_meta_webhook(
    channel_id: str,
    request: Request
):
    """
    Verificación de webhook para Meta/Facebook Cloud API.

    Meta envía una solicitud GET con hub.mode, hub.verify_token y hub.challenge
    """
    try:
        channel_service = get_channel_service()
        channel = await channel_service.get_channel(channel_id)

        if not channel:
            raise HTTPException(404, f"Canal no encontrado: {channel_id}")

        if channel.channel_type != ChannelType.WHATSAPP:
            raise HTTPException(400, "Canal no es de tipo WhatsApp")

        if not channel.whatsapp_config:
            raise HTTPException(400, "Canal sin configuración de WhatsApp")

        # Obtener proveedor
        provider = get_whatsapp_provider(channel.whatsapp_config)
        if not provider:
            raise HTTPException(500, "Error inicializando proveedor")

        # Obtener parámetros de verificación
        mode = request.query_params.get("hub.mode", "")
        token = request.query_params.get("hub.verify_token", "")
        challenge = request.query_params.get("hub.challenge", "")

        result = provider.verify_webhook(mode, token, challenge)

        if result:
            logger.info(f"Meta webhook verificado para canal: {channel_id}")
            return result
        else:
            raise HTTPException(403, "Verificación fallida")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verificando webhook Meta: {e}")
        raise HTTPException(500, str(e))


@router.post("/meta/{channel_id}")
async def handle_meta_webhook(
    channel_id: str,
    request: Request,
    x_hub_signature: Optional[str] = Header(None, alias="X-Hub-Signature-256")
):
    """
    Webhook para recibir mensajes de Meta/Facebook Cloud API.
    """
    try:
        channel_service = get_channel_service()
        channel = await channel_service.get_channel(channel_id)

        if not channel:
            raise HTTPException(404, f"Canal no encontrado: {channel_id}")

        if channel.channel_type != ChannelType.WHATSAPP:
            raise HTTPException(400, "Canal no es de tipo WhatsApp")

        if not channel.whatsapp_config:
            raise HTTPException(400, "Canal sin configuración de WhatsApp")

        # Obtener proveedor
        provider = get_whatsapp_provider(channel.whatsapp_config)
        if not provider:
            raise HTTPException(500, "Error inicializando proveedor")

        # Obtener body
        body = await request.body()
        body_str = body.decode()

        # Verificar firma (opcional en desarrollo)
        # if not provider.verify_signature(body_str, x_hub_signature or ""):
        #     raise HTTPException(403, "Firma inválida")

        # Parsear webhook
        webhook_data = json.loads(body_str)
        parsed_message = provider.parse_webhook(webhook_data)

        if not parsed_message:
            return {"status": "ok", "message": "No message in webhook"}

        # Verificar si es mensaje de texto
        if parsed_message.message_type != "text" or not parsed_message.text:
            await provider.send_message(
                to_number=parsed_message.from_number,
                message="Por el momento solo puedo procesar mensajes de texto."
            )
            return {"status": "ok", "message": "Non-text message"}

        # Marcar como leído
        await provider.mark_message_as_read(parsed_message.message_id)

        # Procesar mensaje
        result = await process_whatsapp_message(parsed_message, channel_id, "meta", bot_id=channel.bot_id)

        # Enviar respuesta
        send_result = await provider.send_message(
            to_number=parsed_message.from_number,
            message=result["response_text"]
        )

        if not send_result.success:
            logger.error(f"Error enviando respuesta a WhatsApp: {send_result.error}")
            return {
                "status": "error",
                "message": "Failed to send response",
                "error": send_result.error,
                "tokens_used": result["tokens_used"],
                "cost_usd": result["cost_usd"]
            }

        logger.info(f"Respuesta enviada exitosamente a {parsed_message.from_number}, message_id: {send_result.message_id}")

        return {
            "status": "ok",
            "message": "Message processed",
            "message_id": send_result.message_id,
            "tokens_used": result["tokens_used"],
            "cost_usd": result["cost_usd"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en webhook Meta: {e}")
        raise HTTPException(500, str(e))


# ==================== WEBHOOKS TWILIO ====================

@router.post("/twilio")
async def handle_twilio_webhook_fallback(
    request: Request,
    x_twilio_signature: Optional[str] = Header(None, alias="X-Twilio-Signature"),
    MessageSid: str = Form(None),
    From: str = Form(None),
    To: str = Form(None),
    Body: str = Form(None),
    NumMedia: str = Form("0"),
    AccountSid: str = Form(None),
    SmsStatus: str = Form(None),
    ProfileName: str = Form(None),
):
    """
    Webhook fallback para Twilio que detecta el canal por número de teléfono.

    Usa el número 'To' (el número de Twilio) para buscar el canal configurado.
    Útil cuando no quieres incluir el channel_id en la URL del webhook.
    """
    try:
        if not To:
            raise HTTPException(400, "Falta el parámetro 'To' en el webhook")

        channel_service = get_channel_service()
        channel = await channel_service.get_channel_by_twilio_phone(To)

        if not channel:
            logger.warning(f"No se encontró canal para el número: {To}")
            raise HTTPException(
                404,
                f"No hay canal configurado para el número {To}. "
                "Crea un canal con este número primero."
            )

        logger.info(f"Canal encontrado por número {To}: {channel.channel_id}")

        # Delegar al handler con channel_id
        return await handle_twilio_webhook(
            channel_id=channel.channel_id,
            request=request,
            x_twilio_signature=x_twilio_signature,
            MessageSid=MessageSid,
            From=From,
            To=To,
            Body=Body,
            NumMedia=NumMedia,
            AccountSid=AccountSid,
            SmsStatus=SmsStatus,
            ProfileName=ProfileName,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en webhook Twilio fallback: {e}")
        raise HTTPException(500, str(e))


@router.post("/twilio/{channel_id}")
async def handle_twilio_webhook(
    channel_id: str,
    request: Request,
    x_twilio_signature: Optional[str] = Header(None, alias="X-Twilio-Signature"),
    # Twilio envía form data
    MessageSid: str = Form(None),
    From: str = Form(None),
    To: str = Form(None),
    Body: str = Form(None),
    NumMedia: str = Form("0"),
    AccountSid: str = Form(None),
    SmsStatus: str = Form(None),
    ProfileName: str = Form(None),
):
    """
    Webhook para recibir mensajes de Twilio WhatsApp.

    Twilio envía los datos como form-urlencoded, no JSON.
    """
    try:
        channel_service = get_channel_service()
        channel = await channel_service.get_channel(channel_id)

        if not channel:
            raise HTTPException(404, f"Canal no encontrado: {channel_id}")

        if channel.channel_type != ChannelType.WHATSAPP:
            raise HTTPException(400, "Canal no es de tipo WhatsApp")

        if not channel.whatsapp_config:
            raise HTTPException(400, "Canal sin configuración de WhatsApp")

        # Verificar que es proveedor Twilio
        if channel.whatsapp_config.provider != WhatsAppProvider.TWILIO:
            raise HTTPException(400, "Canal no configurado para Twilio")

        # Obtener proveedor
        provider = get_whatsapp_provider(channel.whatsapp_config)
        if not provider:
            raise HTTPException(500, "Error inicializando proveedor")

        # Construir diccionario de datos del webhook
        webhook_data = {
            "MessageSid": MessageSid,
            "From": From,
            "To": To,
            "Body": Body,
            "NumMedia": NumMedia,
            "AccountSid": AccountSid,
            "SmsStatus": SmsStatus,
            "ProfileName": ProfileName,
        }

        # Agregar media si existe
        form_data = await request.form()
        num_media = int(NumMedia or "0")
        for i in range(num_media):
            webhook_data[f"MediaUrl{i}"] = form_data.get(f"MediaUrl{i}")
            webhook_data[f"MediaContentType{i}"] = form_data.get(f"MediaContentType{i}")

        logger.info(f"Twilio webhook recibido: {webhook_data}")

        # Parsear mensaje
        parsed_message = provider.parse_webhook(webhook_data)

        if not parsed_message:
            return {"status": "ok", "message": "No message in webhook"}

        # Verificar si es mensaje de texto
        if parsed_message.message_type != "text" or not parsed_message.text:
            await provider.send_message(
                to_number=parsed_message.from_number,
                message="Por el momento solo puedo procesar mensajes de texto."
            )
            return {"status": "ok", "message": "Non-text message"}

        # Procesar mensaje
        result = await process_whatsapp_message(parsed_message, channel_id, "twilio", bot_id=channel.bot_id)

        # Enviar respuesta
        send_result = await provider.send_message(
            to_number=parsed_message.from_number,
            message=result["response_text"]
        )

        if not send_result.success:
            logger.error(f"Error enviando respuesta a WhatsApp (Twilio): {send_result.error}")
            return {
                "status": "error",
                "message": "Failed to send response",
                "error": send_result.error,
                "tokens_used": result["tokens_used"],
                "cost_usd": result["cost_usd"]
            }

        logger.info(f"Respuesta enviada exitosamente (Twilio) a {parsed_message.from_number}, message_id: {send_result.message_id}")

        return {
            "status": "ok",
            "message": "Message processed",
            "message_id": send_result.message_id,
            "tokens_used": result["tokens_used"],
            "cost_usd": result["cost_usd"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en webhook Twilio: {e}")
        raise HTTPException(500, str(e))


# ==================== ENDPOINT GENÉRICO ====================

@router.get("/{provider}/{channel_id}", response_class=PlainTextResponse)
async def verify_generic_webhook(
    provider: str,
    channel_id: str,
    request: Request
):
    """
    Verificación genérica de webhook.
    Redirige al handler específico del proveedor.
    """
    if provider == "meta":
        return await verify_meta_webhook(channel_id, request)
    else:
        raise HTTPException(400, f"Proveedor no soportado para verificación: {provider}")


@router.post("/{provider}/{channel_id}")
async def handle_generic_webhook(
    provider: str,
    channel_id: str,
    request: Request,
    x_hub_signature: Optional[str] = Header(None, alias="X-Hub-Signature-256"),
    x_twilio_signature: Optional[str] = Header(None, alias="X-Twilio-Signature"),
):
    """
    Handler genérico de webhook.
    Detecta el proveedor y redirige al handler específico.
    """
    if provider == "meta":
        return await handle_meta_webhook(channel_id, request, x_hub_signature)
    elif provider == "twilio":
        # Para Twilio necesitamos manejar form data
        form_data = await request.form()
        return await handle_twilio_webhook(
            channel_id=channel_id,
            request=request,
            x_twilio_signature=x_twilio_signature,
            MessageSid=form_data.get("MessageSid"),
            From=form_data.get("From"),
            To=form_data.get("To"),
            Body=form_data.get("Body"),
            NumMedia=form_data.get("NumMedia", "0"),
            AccountSid=form_data.get("AccountSid"),
            SmsStatus=form_data.get("SmsStatus"),
            ProfileName=form_data.get("ProfileName"),
        )
    else:
        raise HTTPException(400, f"Proveedor no soportado: {provider}")
