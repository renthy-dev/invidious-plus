require "json"

# Structure for video chapters
struct VideoChapter
  include JSON::Serializable

  property title : String
  property start_time : Int64  # in seconds
  property thumbnail : String?

  def initialize(@title : String, @start_time : Int64, @thumbnail : String? = nil)
  end

  def to_json(json : JSON::Builder)
    json.object do
      json.field "title", @title
      json.field "startTime", @start_time
      json.field "thumbnail", @thumbnail if @thumbnail
    end
  end
end

module Invidious::JSONify::APIv1
  extend self

  def video(video : Video, json : JSON::Builder, *, locale : String?, proxy : Bool = false)
    json.object do
      json.field "type", video.video_type

      json.field "title", video.title
      json.field "videoId", video.id

      json.field "error", video.info["reason"] if video.info["reason"]?

      json.field "videoThumbnails" do
        self.thumbnails(json, video.id)
      end
      json.field "storyboards" do
        self.storyboards(json, video.id, video.storyboards)
      end

      json.field "description", video.description
      json.field "descriptionHtml", video.description_html
      json.field "published", video.published.to_unix
      json.field "publishedText", translate(locale, "`x` ago", recode_date(video.published, locale))
      json.field "keywords", video.keywords

      json.field "viewCount", video.views
      json.field "likeCount", video.likes
      json.field "dislikeCount", 0_i64

      json.field "paid", video.paid
      json.field "premium", video.premium
      json.field "isFamilyFriendly", video.is_family_friendly
      json.field "allowedRegions", video.allowed_regions
      json.field "genre", video.genre
      json.field "genreUrl", video.genre_url

      json.field "author", video.author
      json.field "authorId", video.ucid
      json.field "authorUrl", "/channel/#{video.ucid}"
      json.field "authorVerified", video.author_verified

      json.field "authorThumbnails" do
        json.array do
          qualities = {32, 48, 76, 100, 176, 512}

          qualities.each do |quality|
            json.object do
              json.field "url", video.author_thumbnail.gsub(/=s\d+/, "=s#{quality}")
              json.field "width", quality
              json.field "height", quality
            end
          end
        end
      end

      json.field "subCountText", video.sub_count_text

      json.field "lengthSeconds", video.length_seconds
      json.field "allowRatings", video.allow_ratings
      json.field "rating", 0_i64
      json.field "isListed", video.is_listed
      json.field "liveNow", video.live_now
      json.field "isPostLiveDvr", video.post_live_dvr
      json.field "isUpcoming", video.upcoming?

      if video.premiere_timestamp
        json.field "premiereTimestamp", video.premiere_timestamp.try &.to_unix
      end

      if hlsvp = video.hls_manifest_url
        hlsvp = hlsvp.gsub("https://manifest.googlevideo.com", HOST_URL)
        json.field "hlsUrl", hlsvp
      end

      json.field "dashUrl", "#{HOST_URL}/api/manifest/dash/id/#{video.id}"

      json.field "adaptiveFormats" do
        json.array do
          video.adaptive_fmts.each do |fmt|
            json.object do
              # Only available on regular videos, not livestreams/OTF streams
              if init_range = fmt["initRange"]?
                json.field "init", "#{init_range["start"]}-#{init_range["end"]}"
              end
              if index_range = fmt["indexRange"]?
                json.field "index", "#{index_range["start"]}-#{index_range["end"]}"
              end

              # Not available on MPEG-4 Timed Text (`text/mp4`) streams (livestreams only)
              json.field "bitrate", fmt["bitrate"].as_i.to_s if fmt["bitrate"]?

              if proxy
                json.field "url", Invidious::HttpServer::Utils.proxy_video_url(
                  fmt["url"].to_s, absolute: true
                )
              else
                json.field "url", fmt["url"]
              end

              json.field "itag", fmt["itag"].as_i.to_s
              json.field "type", fmt["mimeType"]
              json.field "clen", fmt["contentLength"]? || "-1"

              # Last modified is a unix timestamp with µS, with the dot omitted.
              # E.g: 1638056732(.)141582
              #
              # On livestreams, it's not present, so always fall back to the
              # current unix timestamp (up to mS precision) for compatibility.
              last_modified = fmt["lastModified"]?
              last_modified ||= "#{Time.utc.to_unix_ms}000"
              json.field "lmt", last_modified

              json.field "projectionType", fmt["projectionType"]

              height = fmt["height"]?.try &.as_i
              width = fmt["width"]?.try &.as_i

              fps = fmt["fps"]?.try &.as_i

              if fps
                json.field "fps", fps
              end

              if height && width
                json.field "size", "#{width}x#{height}"
                json.field "resolution", "#{height}p"

                quality_label = "#{width > height ? height : width}p"

                if fps && fps > 30
                  quality_label += fps.to_s
                end

                json.field "qualityLabel", quality_label
              end

              if fmt_info = Invidious::Videos::Formats.itag_to_metadata?(fmt["itag"])
                json.field "container", fmt_info["ext"]
                json.field "encoding", fmt_info["vcodec"]? || fmt_info["acodec"]
              end

              # Livestream chunk infos
              json.field "targetDurationSec", fmt["targetDurationSec"].as_i if fmt.has_key?("targetDurationSec")
              json.field "maxDvrDurationSec", fmt["maxDvrDurationSec"].as_i if fmt.has_key?("maxDvrDurationSec")

              # Audio-related data
              json.field "audioQuality", fmt["audioQuality"] if fmt.has_key?("audioQuality")
              json.field "audioSampleRate", fmt["audioSampleRate"].as_s.to_i if fmt.has_key?("audioSampleRate")
              json.field "audioChannels", fmt["audioChannels"] if fmt.has_key?("audioChannels")

              # Extra misc stuff
              json.field "colorInfo", fmt["colorInfo"] if fmt.has_key?("colorInfo")
              json.field "captionTrack", fmt["captionTrack"] if fmt.has_key?("captionTrack")
            end
          end
        end
      end

      json.field "formatStreams" do
        json.array do
          video.fmt_stream.each do |fmt|
            json.object do
              if proxy
                json.field "url", Invidious::HttpServer::Utils.proxy_video_url(
                  fmt["url"].to_s, absolute: true
                )
              else
                json.field "url", fmt["url"]
              end
              json.field "itag", fmt["itag"].as_i.to_s
              json.field "type", fmt["mimeType"]
              json.field "quality", fmt["quality"]

              json.field "bitrate", fmt["bitrate"].as_i.to_s if fmt["bitrate"]?

              height = fmt["height"]?.try &.as_i
              width = fmt["width"]?.try &.as_i

              fps = fmt["fps"]?.try &.as_i

              if fps
                json.field "fps", fps
              end

              if height && width
                json.field "size", "#{width}x#{height}"
                json.field "resolution", "#{height}p"

                quality_label = "#{width > height ? height : width}p"

                if fps && fps > 30
                  quality_label += fps.to_s
                end

                json.field "qualityLabel", quality_label
              end

              if fmt_info = Invidious::Videos::Formats.itag_to_metadata?(fmt["itag"])
                json.field "container", fmt_info["ext"]
                json.field "encoding", fmt_info["vcodec"]? || fmt_info["acodec"]
              end
            end
          end
        end
      end

      json.field "captions" do
        json.array do
          video.captions.each do |caption|
            json.object do
              json.field "label", caption.name
              json.field "language_code", caption.language_code
              json.field "url", "/api/v1/captions/#{video.id}?label=#{URI.encode_www_form(caption.name)}"
            end
          end
        end
      end

      if !video.music.empty?
        json.field "musicTracks" do
          json.array do
            video.music.each do |music|
              json.object do
                json.field "song", music.song
                json.field "artist", music.artist
                json.field "album", music.album
                json.field "license", music.license
              end
            end
          end
        end
      end

      # Add chapters field to the JSON output
      if !video.chapters.empty?
        json.field "chapters" do
          json.array do
            video.chapters.each do |chapter|
              json.object do
                json.field "title", chapter.title
                json.field "startTime", chapter.start_time
                if chapter.thumbnail
                  json.field "thumbnail", chapter.thumbnail
                end
              end
            end
          end
        end
      end

      json.field "recommendedVideos" do
        json.array do
          video.related_videos.each do |rv|
            if rv["id"]?
              json.object do
                json.field "videoId", rv["id"]
                json.field "title", rv["title"]
                json.field "videoThumbnails" do
                  self.thumbnails(json, rv["id"])
                end

                json.field "author", rv["author"]
                json.field "authorUrl", "/channel/#{rv["ucid"]?}"
                json.field "authorId", rv["ucid"]?
                json.field "authorVerified", rv["author_verified"] == "true"
                if rv["author_thumbnail"]?
                  json.field "authorThumbnails" do
                    json.array do
                      qualities = {32, 48, 76, 100, 176, 512}

                      qualities.each do |quality|
                        json.object do
                          json.field "url", rv["author_thumbnail"].gsub(/s\d+-/, "s#{quality}-")
                          json.field "width", quality
                          json.field "height", quality
                        end
                      end
                    end
                  end
                end

                json.field "lengthSeconds", rv["length_seconds"]?.try &.to_i
                json.field "viewCountText", rv["short_view_count"]?
                json.field "viewCount", rv["view_count"]?.try &.empty? ? nil : rv["view_count"].to_i64
                json.field "published", rv["published"]?
                if rv["published"]?.try &.presence
                  json.field "publishedText", translate(locale, "`x` ago", recode_date(Time.parse_rfc3339(rv["published"].to_s), locale))
                else
                  json.field "publishedText", ""
                end
              end
            end
          end
        end
      end
    end
  end

  def storyboards(json, id, storyboards)
    json.array do
      storyboards.each do |sb|
        json.object do
          json.field "url", "/api/v1/storyboards/#{id}?width=#{sb.width}&height=#{sb.height}"
          json.field "templateUrl", sb.url.to_s
          json.field "width", sb.width
          json.field "height", sb.height
          json.field "count", sb.count
          json.field "interval", sb.interval
          json.field "storyboardWidth", sb.columns
          json.field "storyboardHeight", sb.rows
          json.field "storyboardCount", sb.images_count
        end
      end
    end
  end
end

# Use to parse both "compactVideoRenderer" and "endScreenVideoRenderer".
# The former is preferred as it has more videos in it. The second has
# the same 11 first entries as the compact rendered.
#
# TODO: "compactRadioRenderer" (Mix) and
# TODO: Use a proper struct/class instead of a hacky JSON object
def parse_related_video(related : JSON::Any) : Hash(String, JSON::Any)?
  return nil if !related["videoId"]?

  # The compact renderer has video length in seconds, where the end
  # screen rendered has a full text version ("42:40")
  length = related["lengthInSeconds"]?.try &.as_i.to_s
  length ||= related.dig?("lengthText", "simpleText").try do |box|
    decode_length_seconds(box.as_s).to_s
  end

  # Both have "short", so the "long" option shouldn't be required
  channel_info = (related["shortBylineText"]? || related["longBylineText"]?)
    .try &.dig?("runs", 0)

  author = channel_info.try &.dig?("text")
  author_verified = has_verified_badge?(related["ownerBadges"]?).to_s

  ucid = channel_info.try { |ci| HelperExtractors.get_browse_id(ci) }

  # "4,088,033 views", only available on compact renderer
  # and when video is not a livestream
  view_count = related.dig?("viewCountText", "simpleText")
    .try &.as_s.gsub(/\D/, "")

  short_view_count = related.try do |r|
    HelperExtractors.get_short_view_count(r).to_s
  end

  LOGGER.trace("parse_related_video: Found \"watchNextEndScreenRenderer\" container")

  if published_time_text = related["publishedTimeText"]?
    decoded_time = decode_date(published_time_text["simpleText"].to_s)
    published = decoded_time.to_rfc3339.to_s
  else
    published = nil
  end

  # TODO: when refactoring video types, make a struct for related videos
  # or reuse an existing type, if that fits.
  return {
    "id"               => related["videoId"],
    "title"            => related["title"]["simpleText"],
    "author"           => author || JSON::Any.new(""),
    "ucid"             => JSON::Any.new(ucid || ""),
    "length_seconds"   => JSON::Any.new(length || "0"),
    "view_count"       => JSON::Any.new(view_count || "0"),
    "short_view_count" => JSON::Any.new(short_view_count || "0"),
    "author_verified"  => JSON::Any.new(author_verified),
    "published"        => JSON::Any.new(published || ""),
  }
end

# Parse video chapters from YouTube data
def parse_video_chapters(player_response : Hash(String, JSON::Any)) : Array(VideoChapter)
  chapters = [] of VideoChapter

  # Try to extract chapters from engagement panels (most common location)
  engagement_panels = player_response.dig?("engagementPanels")
  engagement_panels.try &.as_a.each do |panel|
    if chapters_renderer = panel.dig?("engagementPanelSectionListRenderer", "content", "macroMarkersListRenderer")
      contents = chapters_renderer.dig?("contents")
      contents.try &.as_a.each do |content|
        if marker = content["macroMarkersListItemRenderer"]?
          title = extract_text(marker.dig?("title"))
          time_description = extract_text(marker.dig?("timeDescription"))
          thumbnail = marker.dig?("thumbnail", "thumbnails", 0, "url").try &.as_s
          
          # Parse time from description (format: "0:00", "1:23", "1:23:45")
          start_time = parse_time_to_seconds(time_description || "0:00")
          
          chapters << VideoChapter.new(title || "", start_time, thumbnail)
        end
      end
    end
  end

  # Alternative: Try to extract from structured chapters data
  if chapters.empty?
    if chapters_data = player_response.dig?("videoDetails", "chapters")
      chapters_data.as_a.each do |chapter|
        title = chapter["title"]?.try &.as_s || ""
        start_time = chapter["time"]?.try &.as_i64 || 0_i64
        thumbnail = chapter.dig?("thumbnail", "thumbnails", 0, "url").try &.as_s
        
        chapters << VideoChapter.new(title, start_time, thumbnail)
      end
    end
  end

  # Parse chapters from description if no structured data found
  if chapters.empty?
    chapters = parse_chapters_from_description(player_response)
  end

  return chapters
end

# Helper method to parse time strings to seconds
def parse_time_to_seconds(time_str : String) : Int64
  parts = time_str.split(":").map(&.to_i)
  case parts.size
  when 1
    parts[0].to_i64
  when 2
    (parts[0] * 60 + parts[1]).to_i64
  when 3
    (parts[0] * 3600 + parts[1] * 60 + parts[2]).to_i64
  else
    0_i64
  end
end

# Parse chapters from video description (fallback method)
def parse_chapters_from_description(player_response : Hash(String, JSON::Any)) : Array(VideoChapter)
  chapters = [] of VideoChapter
  
  description = player_response.dig?("videoDetails", "shortDescription").try &.as_s || ""
  
  # Regex pattern to match timestamps in description
  # Matches patterns like "0:00 Introduction", "1:23 Chapter 1", "1:23:45 Final thoughts"
  timestamp_regex = /(?:^|\n)(\d{1,2}:(?:\d{2}:)?\d{2})\s+(.+?)(?=\n\d{1,2}:|$)/m
  
  description.scan(timestamp_regex) do |match|
    time_str = match[1]
    title = match[2].strip
    start_time = parse_time_to_seconds(time_str)
    
    chapters << VideoChapter.new(title, start_time)
  end
  
  return chapters
end

def extract_video_info(video_id : String)
  # Init client config for the API
  client_config = YoutubeAPI::ClientConfig.new

  # Fetch data from the player endpoint
  player_response = YoutubeAPI.player(video_id: video_id, params: "2AMB", client_config: client_config)

  playability_status = player_response.dig?("playabilityStatus", "status").try &.as_s

  if playability_status != "OK"
    subreason = player_response.dig?("playabilityStatus", "errorScreen", "playerErrorMessageRenderer", "subreason")
    reason = subreason.try &.[]?("simpleText").try &.as_s
    reason ||= subreason.try &.[]("runs").as_a.map(&.[]("text")).join("")
    reason ||= player_response.dig("playabilityStatus", "reason").as_s

    # Stop here if video is not a scheduled livestream or
    # for LOGIN_REQUIRED when videoDetails element is not found because retrying won't help
    if !{"LIVE_STREAM_OFFLINE", "LOGIN_REQUIRED"}.any?(playability_status) ||
       playability_status == "LOGIN_REQUIRED" && !player_response.dig?("videoDetails")
      return {
        "version" => JSON::Any.new(Video::SCHEMA_VERSION.to_i64),
        "reason"  => JSON::Any.new(reason),
      }
    end
  elsif video_id != player_response.dig?("videoDetails", "videoId")
    # YouTube may return a different video player response than expected.
    # See: https://github.com/TeamNewPipe/NewPipe/issues/8713
    # Line to be reverted if one day we solve the video not available issue.

    # Although technically not a call to /videoplayback the fact that YouTube is returning the
    # wrong video means that we should count it as a failure.
    get_playback_statistic()["totalRequests"] += 1

    return {
      "version" => JSON::Any.new(Video::SCHEMA_VERSION.to_i64),
      "reason"  => JSON::Any.new("Can't load the video on this Invidious instance. YouTube is currently trying to block Invidious instances. <a href=\"https://github.com/iv-org/invidious/issues/3822\">Click here for more info about the issue.</a>"),
    }
  else
    reason = nil
  end

  # Don't fetch the next endpoint if the video is unavailable.
  if {"OK", "LIVE_STREAM_OFFLINE", "LOGIN_REQUIRED"}.any?(playability_status)
    next_response = YoutubeAPI.next({"videoId": video_id, "params": ""})
    player_response = player_response.merge(next_response)
  end

  params = parse_video_info(video_id, player_response)
  params["reason"] = JSON::Any.new(reason) if reason

  if !CONFIG.invidious_companion.present?
    if player_response.dig?("streamingData", "adaptiveFormats", 0, "url").nil?
      LOGGER.warn("Missing URLs for adaptive formats, falling back to other YT clients.")
      players_fallback = {YoutubeAPI::ClientType::TvHtml5, YoutubeAPI::ClientType::WebMobile}

      players_fallback.each do |player_fallback|
        client_config.client_type = player_fallback

        next if !(player_fallback_response = try_fetch_streaming_data(video_id, client_config))

        if player_fallback_response.dig?("streamingData", "adaptiveFormats", 0, "url")
          streaming_data = player_response["streamingData"].as_h
          streaming_data["adaptiveFormats"] = player_fallback_response["streamingData"]["adaptiveFormats"]
          player_response["streamingData"] = JSON::Any.new(streaming_data)
          break
        end
      rescue InfoException
        next LOGGER.warn("Failed to fetch streams with #{player_fallback}")
      end
    end

    # Seems like video page can still render even without playable streams.
    # its better than nothing.
    #
    # # Were we able to find playable video streams?
    # if player_response.dig?("streamingData", "adaptiveFormats", 0, "url").nil?
    #   # No :(
    # end
  end

  {"captions", "playabilityStatus", "playerConfig", "storyboards"}.each do |f|
    params[f] = player_response[f] if player_response[f]?
  end

  # Convert URLs, if those are present
  if streaming_data = player_response["streamingData"]?
    %w[formats adaptiveFormats].each do |key|
      streaming_data.as_h[key]?.try &.as_a.each do |format|
        format.as_h["url"] = JSON::Any.new(convert_url(format))
      end
    end

    params["streamingData"] = streaming_data
  end

  # Data structure version, for cache control
  params["version"] = JSON::Any.new(Video::SCHEMA_VERSION.to_i64)

  return params
end

def try_fetch_streaming_data(id : String, client_config : YoutubeAPI::ClientConfig) : Hash(String, JSON::Any)?
  LOGGER.debug("try_fetch_streaming_data: [#{id}] Using #{client_config.client_type} client.")
  response = YoutubeAPI.player(video_id: id, params: "2AMB", client_config: client_config)

  playability_status = response["playabilityStatus"]["status"]
  LOGGER.debug("try_fetch_streaming_data: [#{id}] Got playabilityStatus == #{playability_status}.")

  if id != response.dig?("videoDetails", "videoId")
    # YouTube may return a different video player response than expected.
    # See: https://github.com/TeamNewPipe/NewPipe/issues/8713
    raise InfoException.new(
      "The video returned by YouTube isn't the requested one. (#{client_config.client_type} client)"
    )
  elsif playability_status == "OK"
    return response
  else
    return nil
  end
end

def parse_video_info(video_id : String, player_response : Hash(String, JSON::Any)) : Hash(String, JSON::Any)
  # Top level elements

  main_results = player_response.dig?("contents", "twoColumnWatchNextResults")

  raise BrokenTubeException.new("twoColumnWatchNextResults") if !main_results

  # Primary results are not available on Music videos
  # See: https://github.com/iv-org/invidious/pull/3238#issuecomment-1207193725
  if primary_results = main_results.dig?("results", "results", "contents")
    video_primary_renderer = primary_results
      .as_a.find(&.["videoPrimaryInfoRenderer"]?)
      .try &.["videoPrimaryInfoRenderer"]

    video_secondary_renderer = primary_results
      .as_a.find(&.["videoSecondaryInfoRenderer"]?)
      .try &.["videoSecondaryInfoRenderer"]

    raise BrokenTubeException.new("videoPrimaryInfoRenderer") if !video_primary_renderer
    raise BrokenTubeException.new("videoSecondaryInfoRenderer") if !video_secondary_renderer
  end

  video_details = player_response.dig?("videoDetails")
  if !(microformat = player_response.dig?("microformat", "playerMicroformatRenderer"))
    microformat = {} of String => JSON::Any
  end

  raise BrokenTubeException.new("videoDetails") if !video_details

  # Basic video infos

  title = video_details["title"]?.try &.as_s

  # We have to try to extract viewCount from videoPrimaryInfoRenderer first,
  # then from videoDetails, as the latter is "0" for livestreams (we want
  # to get the amount of viewers watching).
  views_txt = extract_text(
    video_primary_renderer
      .try &.dig?("viewCount", "videoViewCountRenderer", "viewCount")
  )
  views_txt ||= video_details["viewCount"]?.try &.as_s || ""
  views = views_txt.gsub(/\D/, "").to_i64?

  length_txt = (microformat["lengthSeconds"]? || video_details["lengthSeconds"])
    .try &.as_s.to_i64

  published = microformat["publishDate"]?
    .try { |t| Time.parse(t.as_s, "%Y-%m-%d", Time::Location::UTC) } || Time.utc

  premiere_timestamp = microformat.dig?("liveBroadcastDetails", "startTimestamp")
    .try { |t| Time.parse_rfc3339(t.as_s) }

  premiere_timestamp ||= player_response.dig?(
    "playabilityStatus", "liveStreamability",
    "liveStreamabilityRenderer", "offlineSlate",
    "liveStreamOfflineSlateRenderer", "scheduledStartTime"
  )
    .try &.as_s.to_i64
      .try { |t| Time.unix(t) }

  live_now = microformat.dig?("liveBroadcastDetails", "isLiveNow")
    .try &.as_bool
  live_now ||= video_details.dig?("isLive").try &.as_bool || false

  post_live_dvr = video_details.dig?("isPostLiveDvr")
    .try &.as_bool || false

  # Extra video infos

  allowed_regions = microformat["availableCountries"]?
    .try &.as_a.map &.as_s || [] of String

  allow_ratings = video_details["allowRatings"]?.try &.as_bool
  family_friendly = microformat["isFamilySafe"]?.try &.as_bool
  is_listed = video_details["isCrawlable"]?.try &.as_bool
  is_upcoming = video_details["isUpcoming"]?.try &.as_bool

  keywords = video_details["keywords"]?
    .try &.as_a.map &.as_s || [] of String

  # Related videos

  LOGGER.debug("extract_video_info: parsing related videos...")

  related = [] of JSON::Any

  # Parse "compactVideoRenderer" items (under secondary results)
  secondary_results = main_results
    .dig?("secondaryResults", "secondaryResults", "results")
  secondary_results.try &.as_a.each do |element|
    if item = element["compactVideoRenderer"]?
      related_video = parse_related_video(item)
      related << JSON::Any.new(related_video) if related_video
    end
  end

  # If nothing was found previously, fall back to end screen renderer
  if related.empty?
    # Container for "endScreenVideoRenderer" items
    player_overlays = player_response.dig?(
      "playerOverlays", "playerOverlayRenderer",
      "endScreen", "watchNextEndScreenRenderer", "results"
    )

    player_overlays.try &.as_a.each do |element|
      if item = element["endScreenVideoRenderer"]?
        related_video = parse_related_video(item)
        related << JSON::Any.new(related_video) if related_video
      end
    end
  end

  # Likes

  toplevel_buttons = video_primary_renderer
    .try &.dig?("videoActions", "menuRenderer", "topLevelButtons")

  if toplevel_buttons
    # New Format as of december 2023
    likes_button = toplevel_buttons.dig?(0,
      "segmentedLikeDislikeButtonViewModel",
      "likeButtonViewModel",
      "likeButtonViewModel",
      "toggleButtonViewModel",
      "toggleButtonViewModel",
      "defaultButtonViewModel",
      "buttonViewModel"
    )

    likes_button ||= toplevel_buttons.try &.as_a
      .find(&.dig?("toggleButtonRenderer", "defaultIcon", "iconType").=== "LIKE")
      .try &.["toggleButtonRenderer"]

    # New format as of september 2022
    likes_button ||= toplevel_buttons.try &.as_a
      .find(&.["segmentedLikeDislikeButtonRenderer"]?)
      .try &.dig?(
        "segmentedLikeDislikeButtonRenderer",
        "likeButton", "toggleButtonRenderer"
      )

    if likes_button
      likes_txt = likes_button.dig?("accessibilityText")
      # Note: The like count from `toggledText` is off by one, as it would
      # represent the new like count in the event where the user clicks on "like".
      likes_txt ||= (likes_button["defaultText"]? || likes_button["toggledText"]?)
        .try &.dig?("accessibility", "accessibilityData", "label")
      likes = likes_txt.as_s.gsub(/\D/, "").to_i64? if likes_txt

      LOGGER.trace("extract_video_info: Found \"likes\" button. Button text is \"#{likes_txt}\"")
      LOGGER.debug("extract_video_info: Likes count is #{likes}") if likes
    end
  end

  # Description

  description = microformat.dig?("description", "simpleText").try &.as_s || ""
  short_description = player_response.dig?("videoDetails", "shortDescription")

  # description_html = video_secondary_renderer.try &.dig?("description", "runs")
  #  .try &.as_a.try { |t| content_to_comment_html(t, video_id) }

  description_html = parse_description(video_secondary_renderer.try &.dig?("attributedDescription"), video_id)

  # Video metadata

  metadata = video_secondary_renderer
    .try &.dig?("metadataRowContainer", "metadataRowContainerRenderer", "rows")
      .try &.as_a

  genre = microformat["category"]?
  genre_ucid = nil
  license = nil

  metadata.try &.each do |row|
    metadata_title = extract_text(row.dig?("metadataRowRenderer", "title"))
    contents = row.dig?("metadataRowRenderer", "contents", 0)

    if metadata_title == "Category"
      contents = contents.try &.dig?("runs", 0)

      genre = contents.try &.["text"]?
      genre_ucid = contents.try &.dig?("navigationEndpoint", "browseEndpoint", "browseId")
    elsif metadata_title == "License"
      license = contents.try &.dig?("runs", 0, "text")
    elsif metadata_title == "Licensed to YouTube by"
      license = contents.try &.["simpleText"]?
    end
  end

  # Music section

  music_list = [] of VideoMusic
  music_desclist = player_response.dig?(
    "engagementPanels", 1, "engagementPanelSectionListRenderer",
    "content", "structuredDescriptionContentRenderer", "items", 2,
    "videoDescriptionMusicSectionRenderer", "carouselLockups"
  )

  music_desclist.try &.as_a.each do |music_desc|
    artist = nil
    album = nil
    music_license = nil

    # Used when the video has multiple songs
    if song_title = music_desc.dig?("carouselLockupRenderer", "videoLockup", "compactVideoRenderer", "title")
      # "simpleText" for plain text / "runs" when song has a link
      song = song_title["simpleText"]? || song_title.dig?("runs", 0, "text")

      # some videos can have empty tracks. See: https://www.youtube.com/watch?v=eBGIQ7ZuuiU
      next if !song
    end

    music_desc.dig?("carouselLockupRenderer", "infoRows").try &.as_a.each do |desc|
      desc_title = extract_text(desc.dig?("infoRowRenderer", "title"))
      if desc_title == "ARTIST"
        artist = extract_text(desc.dig?("infoRowRenderer", "defaultMetadata"))
      elsif desc_title == "SONG"
        song = extract_text(desc.dig?("infoRowRenderer", "defaultMetadata"))
      elsif desc_title == "ALBUM"
        album = extract_text(desc.dig?("infoRowRenderer", "defaultMetadata"))
      elsif desc_title == "LICENSES"
        music_license = extract_text(desc.dig?("infoRowRenderer", "expandedMetadata"))
      end
    end
    music_list << VideoMusic.new(song.to_s, album.to_s, artist.to_s, music_license.to_s)
  end

  # Author infos

  author = video_details["author"]?.try &.as_s
  ucid = video_details["channelId"]?.try &.as_s

  if author_info = video_secondary_renderer.try &.dig?("owner", "videoOwnerRenderer")
    author_thumbnail = author_info.dig?("thumbnail", "thumbnails", 0, "url")
    author_verified = has_verified_badge?(author_info["badges"]?)

    subs_text = author_info["subscriberCountText"]?
      .try { |t| t["simpleText"]? || t.dig?("runs", 0, "text") }
      .try &.as_s.split(" ", 2)[0]
  end

  # Parse chapters
  chapters = parse_video_chapters(player_response)

  # Return data

  if live_now
    video_type = VideoType::Livestream
  elsif !premiere_timestamp.nil?
    video_type = VideoType::Scheduled
    published = premiere_timestamp || Time.utc
  else
    video_type = VideoType::Video
  end

  params = {
    "videoType" => JSON::Any.new(video_type.to_s),
    # Basic video infos
    "title"         => JSON::Any.new(title || ""),
    "views"         => JSON::Any.new(views || 0_i64),
    "likes"         => JSON::Any.new(likes || 0_i64),
    "lengthSeconds" => JSON::Any.new(length_txt || 0_i64),
    "published"     => JSON::Any.new(published.to_rfc3339),
    # Extra video infos
    "allowedRegions"   => JSON::Any.new(allowed_regions.map { |v| JSON::Any.new(v) }),
    "allowRatings"     => JSON::Any.new(allow_ratings || false),
    "isFamilyFriendly" => JSON::Any.new(family_friendly || false),
    "isListed"         => JSON::Any.new(is_listed || false),
    "isUpcoming"       => JSON::Any.new(is_upcoming || false),
    "keywords"         => JSON::Any.new(keywords.map { |v| JSON::Any.new(v) }),
    "isPostLiveDvr"    => JSON::Any.new(post_live_dvr),
    # Related videos
    "relatedVideos" => JSON::Any.new(related),
    # Description
    "description"      => JSON::Any.new(description || ""),
    "descriptionHtml"  => JSON::Any.new(description_html || "<p></p>"),
    "shortDescription" => JSON::Any.new(short_description.try &.as_s || nil),
    # Video metadata
    "genre"     => JSON::Any.new(genre.try &.as_s || ""),
    "genreUcid" => JSON::Any.new(genre_ucid.try &.as_s?),
    "license"   => JSON::Any.new(license.try &.as_s || ""),
    # Music section
    "music" => JSON.parse(music_list.to_json),
    # Chapters
    "chapters" => JSON::Any.new(chapters.map do |chapter|
      JSON::Any.new({
        "title" => JSON::Any.new(chapter.title),
        "startTime" => JSON::Any.new(chapter.start_time.to_i64),
        "thumbnail" => chapter.thumbnail ? JSON::Any.new(chapter.thumbnail.not_nil!) : JSON::Any.new(nil)
      }.compact)
    end),
    # Author infos
    "author"          => JSON::Any.new(author || ""),
    "ucid"            => JSON::Any.new(ucid || ""),
    "authorThumbnail" => JSON::Any.new(author_thumbnail.try &.as_s || ""),
    "authorVerified"  => JSON::Any.new(author_verified || false),
    "subCountText"    => JSON::Any.new(subs_text || "-"),
  }

  return params
end

private def convert_url(fmt)
  if cfr = fmt["signatureCipher"]?.try { |json| HTTP::Params.parse(json.as_s) }
    sp = cfr["sp"]
    url = URI.parse(cfr["url"])
    params = url.query_params

    LOGGER.debug("convert_url: Decoding '#{cfr}'")

    unsig = DECRYPT_FUNCTION.try &.decrypt_signature(cfr["s"])
    params[sp] = unsig if unsig
  else
    url = URI.parse(fmt["url"].as_s)
    params = url.query_params
  end

  n = DECRYPT_FUNCTION.try &.decrypt_nsig(params["n"])
  params["n"] = n if n

  if token = CONFIG.po_token
    params["pot"] = token
  end

  url.query_params = params
  LOGGER.trace("convert_url: new url is '#{url}'")

  return url.to_s
rescue ex
  LOGGER.debug("convert_url: Error when parsing video URL")
  LOGGER.trace(ex.inspect_with_backtrace)
  return ""
end