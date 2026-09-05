import { createContext } from 'react'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'

export const ChatTransportContext = createContext<ChatTransport | null>(null)
