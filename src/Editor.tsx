import { useEffect, useState } from "react"
import ReactQuill from "react-quill"
import 'react-quill/dist/quill.snow.css'
import { QuillBinding } from "y-quill"
import * as Y from 'yjs'
import * as Ably from 'ably'

const API_KEY = 'kHrEyw.Re6ZBw:xMB1rjfLpsf_IVkg4Y8gYKqK-DaaJ5blYisvXgXDb58'

export const Editor = () => {
  const [quill, setQuill] = useState<ReactQuill | null>(null)
  const [doc] = useState(new Y.Doc())

  const realtime = useRealtime()

  useChannel(realtime, doc)

  useEffect(() => {
    console.log('useEffect', doc, quill)
    if (!doc || !quill) return
    console.log('binding')
    doc.on('update', () => console.log('update'))
    const binding = new QuillBinding(doc.getText('t'), quill.editor)
    return () => binding.destroy()
  }, [doc, quill])

  return <ReactQuill theme="snow" ref={(q) => setQuill(q)} />
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

const useChannel = (realtime: Ably.Realtime | null, doc: Y.Doc) => {
  useEffect(() => {
    if (!realtime) return
    const channel = realtime.channels.get('docs:foo')
  
    channel.subscribe('update', (message) => {
      const update = new Uint8Array(message.data)
      console.log('channel.subscribe: update', { update, data: message.data })
      Y.applyUpdate(doc, update)
    })

    doc.on('update', (update) => {
      console.log('doc.update', update)
      channel.publish('update', update)
    })

    channel.history({ direction: 'forwards', limit: 1000 }, (error, result) => {
      if (!result) return
      console.log('history', result.items)
      for (const message of result.items) {
        const update = new Uint8Array(message.data)
        Y.applyUpdate(doc, update)
      }
    })

    return () => {
      channel.detach()
      realtime.channels.release('foo')
    }
  }, [realtime, doc])
}