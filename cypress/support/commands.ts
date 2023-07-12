import 'cypress-wait-frames'

import { IDLE_SCROLL_FRAME_COUNT } from '../../src/constants'

declare global {
   namespace Cypress {
      interface Chainable {
         scrollWithDelta: (options: ScrollWithDeltaOptions) => void
         waitForIdleScroll: () => void
      }
   }
}

type ScrollWithDeltaOptions = {
   delta: number
   scrollDown?: boolean
   minDuration?: number
}

Cypress.Commands.add(
   'scrollWithDelta',
   ({ delta, scrollDown = true, minDuration = 1000 }: ScrollWithDeltaOptions) => {
      let distance = delta * minDuration
      let duration = minDuration

      // If obtained distance is below header height, throw an error
      cy.get('header').then(($header) => {
         const headerHeight = $header.height()

         if (headerHeight && distance < headerHeight) {
            throw new Error(
               `Scrolling distance (${distance}) is less than ${headerHeight}px. Adjust second parameter (minDuration).`
            )
         }
      })

      cy.log(`Scrolling ${distance}px with ${delta} delta in ${duration}ms`)

      cy.scrollTo(0, scrollDown ? distance : -1 * distance, { duration })
   }
)

Cypress.Commands.add('waitForIdleScroll', () => {
   cy.waitFrames({ subject: cy.document, property: 'scrollTop', frames: IDLE_SCROLL_FRAME_COUNT })
})

export {}
