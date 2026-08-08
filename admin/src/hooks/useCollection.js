import { useCallback, useEffect, useRef, useState } from 'react'

const EXIT_MS = 500 // matches the original fadeOut() timing

/**
 * A mutable table/card collection.
 *
 * `remove(id)` reproduces the original `fadeOut()`: the row slides right and
 * fades for 500ms (via the `.row-exit` class) and is only then dropped from
 * state, so the exit animation is preserved.
 */
export default function useCollection(initial) {
  const [items, setItems] = useState(initial)
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const patch = useCallback((id, changes) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...changes } : i)))
  }, [])

  const remove = useCallback(
    (id) => {
      patch(id, { exiting: true })
      timers.current.push(
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), EXIT_MS)
      )
    },
    [patch]
  )

  return { items, setItems, patch, remove }
}
