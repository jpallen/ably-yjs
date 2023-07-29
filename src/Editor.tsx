import { useEffect, useState } from "react"
import Quill from 'quill'
import ReactQuill from "react-quill"
import 'react-quill/dist/quill.snow.css'
import { QuillBinding } from "y-quill"
import QuillCursors from 'quill-cursors'
import * as Y from 'yjs'
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates
} from 'y-protocols/awareness'
import * as Ably from 'ably'

Quill.register('modules/cursors', QuillCursors)

const API_KEY = process.env.REACT_APP_ABLY_API_KEY

export const Editor = () => {
  const [quill, setQuill] = useState<ReactQuill | null>(null)
  const [doc] = useState(new Y.Doc())
  const [awareness] = useState(new Awareness(doc))

  const realtime = useRealtime()

  useChannel(realtime, doc, awareness)

  useEffect(() => {
    if (!doc || !quill) return
    const binding = new QuillBinding(doc.getText('t'), quill.editor, awareness)
    return () => binding.destroy()
  }, [doc, quill, awareness])

  return <ReactQuill theme="snow" ref={(q) => setQuill(q)} modules={{ cursors: true }} />
}

const useRealtime = () => {
  const [realtime, setRealtime] = useState<Ably.Realtime | null>(null)
  
  useEffect(() => {
    const realtime = new Ably.Realtime({ key: API_KEY, echoMessages: false })
    setRealtime(realtime)
    return () => realtime.close()
  }, [])

  return realtime
}

type AwarenessUpdate = {
  added: number[]
  removed: number[]
  updated: number[]
}

const useChannel = (realtime: Ably.Realtime | null, doc: Y.Doc, awareness: Awareness) => {
  useEffect(() => {
    if (!realtime) return
    const channel = realtime.channels.get('docs:foo')
  
    channel.subscribe('update', (message) => {
      const update = new Uint8Array(message.data)
      Y.applyUpdate(doc, update)
    })

    channel.subscribe('awareness', (message) => {
      const update = new Uint8Array(message.data)
      applyAwarenessUpdate(awareness, update, 'server')
    })

    doc.on('update', (update) => {
      channel.publish('update', update)
    })

    awareness.on(
      'update',
      ({ added, updated, removed }: AwarenessUpdate, origin: any) => {
        const changedClients = added.concat(updated).concat(removed)
        const update = encodeAwarenessUpdate(awareness, changedClients)
        channel.publish('awareness', update, origin)
      }
    )

    window?.addEventListener('beforeunload', () => {
      removeAwarenessStates(awareness, [doc.clientID], 'window unload')
    })

    channel.history({ direction: 'forwards', limit: 1000 }, (error, result) => {
      if (!result) return
      for (const message of result.items) {
        const update = new Uint8Array(message.data)
        Y.applyUpdate(doc, update)
      }
    })

    return () => {
      channel.detach()
      realtime.channels.release('foo')
    }
  }, [realtime, doc, awareness])
}