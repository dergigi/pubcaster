import { NostrService } from '@/services/nostr/NostrService'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import Image from 'next/image'
import type { ReactElement } from 'react'
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

// Define the profile interface
interface NostrProfile {
  name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  lud06?: string;
}

// Function to count words in a string
function countWords(str: string): number {
  return str.split(/\s+/).filter(word => word.length > 0).length;
}

// Function to count links in HTML content
function countLinks(html: string): number {
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>/g;
  const matches = html.match(linkRegex);
  return matches ? matches.length : 0;
}

// Configure marked to use GitHub Flavored Markdown
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert line breaks to <br>
})

// Create service instance
const nostrService = new NostrService()

// Initialize NDK connection
let initialized = false

export default async function NpubPage({
  params,
}: {
  params: Promise<{ npub: string }>
}): Promise<ReactElement> {
  // Initialize NDK if not already initialized
  if (!initialized) {
    await nostrService.initialize()
    initialized = true
    console.log('NDK initialized successfully')
  }
  
  // Get the npub from params
  const resolvedParams = await params
  const npub = resolvedParams.npub
  
  if (!npub) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-gray-900">Invalid Profile</h1>
          <p className="text-gray-600">No profile ID provided.</p>
        </div>
      </div>
    )
  }

  const profile = await nostrService.getUserProfile(npub)
  const events = await nostrService.getKind1Events(npub)
  const mediaEvents = events.filter(event => nostrService.isMediaEvent(event))
  
  // Fetch all long-form posts for the user
  const longFormEvents = await nostrService.getLongFormEvents(npub)
  
  // Create a map of kind1 event titles to long-form events for quick lookup
  const longFormMap = nostrService.matchLongFormShowNotes(mediaEvents, longFormEvents)
  
  // Create a map to store zap profiles for each long-form event
  const zapProfilesMap = new Map<string, Map<string, NostrProfile>>()
  
  // Create a map to store value split information for each long-form event
  const valueSplitMap = new Map<string, Map<string, number>>()
  
  // Fetch zap profiles for each long-form event
  for (const longFormEvent of Array.from(longFormMap.values())) {
    const zapProfiles = await nostrService.fetchZapProfiles(longFormEvent)
    if (zapProfiles.size > 0) {
      zapProfilesMap.set(longFormEvent.id, zapProfiles)
    }
    
    // Extract value split information
    const valueSplit = nostrService.extractValueSplitFromEvent(longFormEvent)
    if (valueSplit.size > 0) {
      valueSplitMap.set(longFormEvent.id, valueSplit)
    }
  }
  
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-gray-900">Profile Not Found</h1>
          <p className="text-gray-600">The requested profile could not be found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner */}
      <div className="relative h-72 bg-gray-900">
        {profile.banner && (
          <Image
            src={profile.banner}
            alt="Profile banner"
            fill
            className="object-cover opacity-90"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/10 via-gray-900/50 to-gray-900/80" />
      </div>
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-40">
        {/* Profile Info */}
        <div className="relative flex flex-col items-center text-center mb-16">
          <a href={`${process.env.HTTP_NOSTR_GATEWAY}/${npub}`} className="relative w-40 h-40 rounded-full ring-4 ring-white bg-white shadow-xl overflow-hidden mb-6">
            {profile.image && (
              <Image
                src={profile.image}
                alt={profile.name || npub}
                fill
                className="object-cover"
                priority
              />
            )}
          </a>
          <h1 className="text-4xl font-bold text-gray-800 mb-4 tracking-tight">{profile.name || npub}</h1>
          {profile.about && (
            <p className="text-gray-600 text-lg max-w-2xl leading-relaxed">{profile.about}</p>
          )}
        </div>

        {/* Podcast Feed Link */}
        <div className="mb-16 text-center">
          <a
            href={`/${npub}/rss.xml`}
            className="inline-flex items-center px-4 py-2 text-sm text-gray-100 hover:text-white transition-colors rounded-full bg-gray-900/40 hover:bg-gray-900/60 backdrop-blur-sm"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            Subscribe to RSS Feed
          </a>
        </div>

        {/* Media Posts */}
        <div className="space-y-6">
          {mediaEvents.map((event: NDKEvent) => {
            const audioUrl = event.content.match(/https?:\/\/[^\s]+\.(mp3|m4a|wav|ogg)/)?.[0]
            const videoUrl = event.content.match(/https?:\/\/[^\s]+\.(mp4|webm|mov)/)?.[0]
            const cleanContent = event.content.replace(audioUrl || videoUrl || '', '').trim()
            const [headline, ...rest] = cleanContent.split('\n')
            const bodyContent = rest.join('\n').trim()
            
            // Find matching long-form content
            const longFormEvent = longFormMap.get(headline)
            
            // Get zap profiles for this long-form event if it exists
            const zapProfiles = longFormEvent ? zapProfilesMap.get(longFormEvent.id) : undefined
            
            // Get value split information for this long-form event if it exists
            const valueSplit = longFormEvent ? valueSplitMap.get(longFormEvent.id) : undefined
            
            return (
              <div key={event.id} className="bg-white rounded-xl shadow-sm overflow-hidden transition hover:shadow-md">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4 gap-4">
                    <div className="flex gap-4 items-start flex-1">
                      {/* Cover Image */}
                      {longFormEvent && ((): JSX.Element | null => {
                        const coverImage = nostrService.extractImage(longFormEvent);
                        return coverImage ? (
                          <div className="w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden relative">
                            <Image
                              src={coverImage}
                              alt={headline}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ) : null;
                      })()}
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900 leading-tight mb-2">{headline}</h2>
                        {bodyContent && (
                          <p className="text-gray-600 whitespace-pre-line">{bodyContent}</p>
                        )}
                      </div>
                    </div>
                    <a 
                      href={`${process.env.HTTP_NOSTR_GATEWAY}/${event.id}`}
                      className="text-sm text-gray-500 whitespace-nowrap hover:text-gray-700 hover:underline"
                    >
                      {new Date(event.created_at * 1000).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </a>
                  </div>
                  {audioUrl && (
                    <div className="mt-4">
                      <audio
                        controls
                        className="w-full h-12 [&::-webkit-media-controls-panel]:bg-gray-50"
                        src={audioUrl}
                      >
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}
                  {videoUrl && (
                    <div className="mt-4">
                      <video
                        controls
                        className="w-full rounded-lg"
                        src={videoUrl}
                      >
                        Your browser does not support the video element.
                      </video>
                    </div>
                  )}
                  
                  {/* Show Notes (Long-form Content) */}
                  {longFormEvent && (
                    <div className="mt-6 border-t border-gray-100 pt-4">
                      <details className="group">
                        <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                          <span>Show Notes</span>
                          <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="mt-3 prose prose-sm max-w-none text-gray-600 [&_li]:my-1 [&_li>p]:my-0">
                          {function renderShowNotes(): JSX.Element {
                            const wordCount = countWords(longFormEvent.content);
                            const parsedHtml = marked.parse(longFormEvent.content, { gfm: true, breaks: true, async: false });
                            const linkCount = countLinks(parsedHtml);
                            return (
                              <>
                                <div className="text-xs text-gray-500 mb-3 text-right">
                                  <a 
                                    href={`${process.env.HTTP_NOSTR_GATEWAY}/${longFormEvent.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-gray-700"
                                  >
                                    {wordCount.toLocaleString()} words
                                  </a>
                                  {' · '}{linkCount} links
                                </div>
                                <div 
                                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedHtml) }} 
                                />
                              </>
                            );
                          }()}
                        </div>
                      </details>
                    </div>
                  )}
                  
                  {/* Zap Splits Section */}
                  {longFormEvent && zapProfiles && zapProfiles.size > 0 && (
                    <div className="mt-6 border-t border-gray-100 pt-4">
                      <details className="group">
                        <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                          <span>Zap Splits</span>
                          <div className="flex items-center">
                            <div className="flex items-center mr-3 -space-x-2 overflow-hidden">
                              {Array.from(zapProfiles.entries()).map(([pubkey, profile]) => (
                                <a 
                                  key={pubkey}
                                  href={`${process.env.HTTP_NOSTR_GATEWAY}/p/${pubkey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-6 h-6 rounded-full ring-2 ring-white overflow-hidden relative hover:ring-blue-300 transition-all"
                                  title={profile.name || pubkey.slice(0, 8)}
                                >
                                  {profile.picture ? (
                                    <Image
                                      src={profile.picture}
                                      alt={profile.name || pubkey.slice(0, 8)}
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                      {(profile.name || pubkey).slice(0, 2)}
                                    </div>
                                  )}
                                </a>
                              ))}
                            </div>
                            <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </summary>
                        <div className="mt-3">
                          <div className="text-sm text-gray-600">
                            {Array.from(zapProfiles.entries()).map(([pubkey, profile]) => {
                              const percentage = valueSplit?.get(pubkey) || 0;
                              return (
                                <div key={pubkey} className="flex items-center justify-between py-1">
                                  <div className="flex items-center">
                                    <a 
                                      href={`${process.env.HTTP_NOSTR_GATEWAY}/p/${pubkey}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center hover:text-blue-600"
                                    >
                                      <div className="w-6 h-6 rounded-full overflow-hidden relative mr-2">
                                        {profile.picture ? (
                                          <Image
                                            src={profile.picture}
                                            alt={profile.name || pubkey.slice(0, 8)}
                                            fill
                                            className="object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                            {(profile.name || pubkey).slice(0, 2)}
                                          </div>
                                        )}
                                      </div>
                                      <span>{profile.name || pubkey.slice(0, 8)}</span>
                                    </a>
                                  </div>
                                  <span className="text-gray-500">{percentage}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {mediaEvents.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-500">No media posts found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 