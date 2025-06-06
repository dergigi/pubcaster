import { NextRequest, NextResponse } from 'next/server'
import { NostrService } from '@/services/nostr/NostrService'
import { PodcastFeedGenerator } from '@/services/feed/PodcastFeedGenerator'

// Create service instances
const nostrService = new NostrService()
const feedGenerator = new PodcastFeedGenerator()

// Initialize NDK connection
let initialized = false

/**
 * Generates an RSS feed for audio podcasts.
 * Note: This endpoint only includes audio content and excludes video content,
 * as it follows the podcast RSS specification. Videos are available on the web interface.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ npub: string }> }
): Promise<NextResponse> {
  try {
    // Initialize NDK if not already initialized
    if (!initialized) {
      await nostrService.initialize()
      initialized = true
      console.log('NDK initialized successfully')
    }
    
    const resolvedParams = await params
    const npub = resolvedParams.npub
    const profile = await nostrService.getUserProfile(npub)
    const events = await nostrService.getKind1Events(npub)
    const mediaEvents = events.filter(event => nostrService.isMediaEvent(event))
    
    // Fetch long-form content for show notes
    const longFormEvents = await nostrService.getLongFormEvents(npub)
    
    // Create a map of kind1 event titles to long-form events for quick lookup
    const longFormMap = nostrService.matchLongFormShowNotes(mediaEvents, longFormEvents)
    
    // Add long-form content to media events
    const eventsWithShowNotes = nostrService.addShowNotesToEvents(mediaEvents, longFormMap)
    
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    const feed = feedGenerator.generateFeed(profile, eventsWithShowNotes, npub)
    
    return new NextResponse(feed, {
      headers: {
        'Content-Type': 'application/xml',
      },
    })
  } catch (error) {
    console.error('Error generating feed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 