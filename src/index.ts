import { ref, onBeforeUnmount, unref, watch, type CSSProperties } from 'vue'

import { mergeDefined } from './utils'
import {
   CAPTURE_DELTA_FRAME_COUNT,
   VISIBILITY_VISIBLE,
   VISIBILITY_HIDDEN,
   defaultOptions,
} from './constants'

import type { UseFixedHeaderOptions, MaybeTemplateRef } from './types'

export function useFixedHeader(
   target: MaybeTemplateRef,
   options: Partial<UseFixedHeaderOptions> = defaultOptions
) {
   const mergedOptions = mergeDefined(defaultOptions, options)

   const isVisible = ref(true)

   let isListeningScroll = false

   // Utils

   function getRoot() {
      if (typeof window === 'undefined') return null
      const root = unref(mergedOptions.root)
      if (root != null) return root

      return document.documentElement
   }

   function getScrollTop() {
      const root = getRoot()
      if (!root) return 0

      return (root as HTMLElement).scrollTop
   }

   function isFixed() {
      const el = unref(target)
      if (!el) return false

      const { position, display } = getComputedStyle(el)
      return (position === 'fixed' || position === 'sticky') && display !== 'none'
   }

   function getHeaderHeight() {
      const el = unref(target)
      if (!el) return 0

      let headerHeight = el.scrollHeight

      const { marginTop, marginBottom } = getComputedStyle(el)
      headerHeight += parseFloat(marginTop) + parseFloat(marginBottom)

      return headerHeight
   }

   function setStyles(styles: CSSProperties) {
      const el = unref(target)
      if (el) {
         Object.assign(el.style, styles)
      }
   }

   function removeStyles() {
      const el = unref(target)
      if (el) {
         const properties = Object.keys({
            ...mergedOptions.enterStyles,
            ...mergedOptions.leaveStyles,
         }).concat('visibility')

         properties.forEach((prop) => el.style.removeProperty(prop))
      }
   }

   /**
    * Hides the header on page load/scroll restoration before it
    * has a chance to paint, only if scroll is instant.
    *
    * If not instant (smooth-scroll) 'isBelowHeader' will resolve
    * to false and the header will be visible until scroll is triggered.
    */
   function onInstantScrollRestoration() {
      requestAnimationFrame(() => {
         const isBelowHeader = getScrollTop() > getHeaderHeight() * 1.2
         if (isBelowHeader) {
            isVisible.value = false
            setStyles({ ...mergedOptions.leaveStyles, ...VISIBILITY_HIDDEN })
         }
      })
   }

   function onVisible() {
      setStyles({ ...mergedOptions.enterStyles, ...VISIBILITY_VISIBLE })
   }

   function onHidden() {
      setStyles(mergedOptions.leaveStyles)

      const el = unref(target)
      if (el) {
         el.ontransitionend = () => {
            if (!isVisible.value) setStyles(VISIBILITY_HIDDEN)
            el.ontransitionend = null
         }
      }
   }

   // Event handlers

   function createScrollHandler() {
      let captureEnterDelta = true
      let captureLeaveDelta = true

      let prevTop = 0

      function captureDelta(onCaptured: (value: number) => void) {
         let rafId: DOMHighResTimeStamp | undefined = undefined
         let frameCount = 0

         const startMs = performance.now()
         const startY = getScrollTop()

         function rafDelta() {
            const nextY = getScrollTop()

            if (frameCount === CAPTURE_DELTA_FRAME_COUNT) {
               onCaptured(Math.abs(startY - nextY) / (performance.now() - startMs))
               cancelAnimationFrame(rafId as DOMHighResTimeStamp)
            } else {
               frameCount++
               requestAnimationFrame(rafDelta)
            }
         }

         rafId = requestAnimationFrame(rafDelta)
      }

      return () => {
         const isTopReached = getScrollTop() <= getHeaderHeight()
         const isScrollingUp = getScrollTop() < prevTop
         const isScrollingDown = getScrollTop() > prevTop

         if (isTopReached) {
            isVisible.value = true
         } else {
            if (prevTop !== 0) {
               if (isScrollingUp && captureEnterDelta) {
                  captureEnterDelta = false

                  captureDelta((value) => {
                     if (value >= mergedOptions.enterDelta) {
                        isVisible.value = true
                     }

                     captureEnterDelta = true
                  })
               } else if (isScrollingDown && captureLeaveDelta) {
                  captureLeaveDelta = false

                  captureDelta((value) => {
                     if (value >= mergedOptions.leaveDelta) {
                        isVisible.value = false
                     }

                     captureLeaveDelta = true
                  })
               }
            }
         }

         prevTop = getScrollTop()
      }
   }

   const onScroll = createScrollHandler()

   function toggleFunctionalities() {
      const isValid = isFixed()

      if (isListeningScroll) {
         // If the header is not anymore fixed or sticky
         if (!isValid) {
            removeStyles()
            toggleScollListener(true)
         }
         // If was not listening and now is fixed or sticky
      } else {
         if (isValid) toggleScollListener()
      }
   }

   function toggleScollListener(isRemove = false) {
      const root = getRoot()
      if (!root) return

      const scrollRoot = root === document.documentElement ? window : root
      const method = isRemove ? 'removeEventListener' : 'addEventListener'

      scrollRoot[method]('scroll', onScroll, { passive: true })

      isListeningScroll = !isRemove
   }

   let skipInitial = true
   let resizeObserver: ResizeObserver | undefined = undefined

   function addResizeObserver() {
      resizeObserver = new ResizeObserver(() => {
         if (skipInitial) return (skipInitial = false)
         toggleFunctionalities()
      })

      const root = getRoot()
      if (root) resizeObserver.observe(root)
   }

   function resetListeners() {
      toggleScollListener(true)
      resizeObserver?.disconnect()
      isVisible.value = true
   }

   // Watchers

   watch(
      () => [unref(target), unref(mergedOptions.root)],
      (_target, _, onCleanup) => {
         onCleanup(resetListeners)

         if (_target) {
            /**
             * Resize listener is added in any case as is in charge
             * of toggling the scroll listener if the header
             * turns from fixed/sticky to something else.
             */

            addResizeObserver()

            if (!isFixed()) return

            /**
             * Immediately hides the header on page load, this has no effect if
             * scroll restoration is smooth (nuxt default behavior)
             */
            onInstantScrollRestoration()

            // This hides the header in case of smooth-scroll restoration
            toggleScollListener()
         }
      },
      { immediate: true, flush: 'post' }
   )

   // Updates styles once scroll listener is up and running
   watch(isVisible, (_isVisible) => {
      if (!isListeningScroll) return

      if (_isVisible) onVisible()
      else onHidden()
   })

   watch(mergedOptions.watch, toggleFunctionalities, { flush: 'post' })

   // Lifecycle

   onBeforeUnmount(resetListeners)

   return isVisible
}