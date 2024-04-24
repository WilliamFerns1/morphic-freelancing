import { createStreamableUI, createStreamableValue } from 'ai/rsc'
import {
  ExperimentalMessage,
  ToolCallPart,
  ToolResultPart,
  experimental_streamText
} from 'ai'
import { searchSchema } from '@/lib/schema/search'
import { Section } from '@/components/section'
import { OpenAI } from '@ai-sdk/openai'
import { ToolBadge } from '@/components/tool-badge'
import { SearchSkeleton } from '@/components/search-skeleton'
import { SearchResults } from '@/components/search-results'
import { BotMessage } from '@/components/message'
import { SearchResultsImageSection } from '@/components/search-results-image'
import { Card } from '@/components/ui/card'
import { ShopifyProduct, ShopifyProducts } from "@/lib/interfaces"

export async function researcher(
  uiStream: ReturnType<typeof createStreamableUI>,
  streamText: ReturnType<typeof createStreamableValue<string>>,
  messages: ExperimentalMessage[]
) {

  const openai_api_key = process.env.OPENAI_API_KEYY
  const openai_api_model = process.env.OPENAI_API_MODEL

  console.log(openai_api_key, openai_api_model)
  const openai = new OpenAI({
    // baseUrl: process.env.OPENAI_API_BASE, // optional base URL for proxies etc.
    apiKey: openai_api_key, // optional API key, default to env property OPENAI_API_KEY
    organization: '' // optional organization
  })
  let fullResponse = ''
  let hasError = false
  const answerSection = (
    <Section title="Answer">
      <BotMessage content={streamText.value} />
    </Section>
  )

  const storeName = process.env.STORE_NAME
  const storeUrl = process.env.STORE_URL || ""

  const result = await experimental_streamText({
    model: openai.chat(openai_api_model || 'gpt-4-turbo'),
    maxTokens: 2500,
    system: `As a professional shopify product search expert, you possess the ability to search for any information on the ${storeName} shopify store. 
    For each user query, utilize the product results to their fullest potential to provide additional information and assistance in your response.
    Aim to directly address the user's question, augmenting your response with insights gleaned from the search results.
    Please match the language of the response to the user's language.`,
    messages,
    tools: {
      search: {
        description: 'Search the shopfiy store for specific products',
        parameters: searchSchema,
        execute: async ({
          search_query,
          max_results,
        }: {
          search_query: string,
          max_results: number,
        }) => {
          uiStream.update(
            <Section>
              <ToolBadge tool="search">{`${search_query}`}</ToolBadge>
            </Section>
          )

          uiStream.append(
            <Section>
              <SearchSkeleton />
            </Section>
          )

          // Tavily API requires a minimum of 5 characters in the query
          const filledQuery =
            search_query.length < 5 ? search_query + ' '.repeat(5 - search_query.length) : search_query
          
          if (storeUrl.length < 5) {
            throw new Error(`Store url invalid`)
          }
          
          let searchResult: ShopifyProducts;

          try {
            searchResult = await shopifyStoreSearch(
              storeUrl, 
              filledQuery,
            )
          } 
          catch (error) {
            console.error('Search API error:', error)
            hasError = true
            throw new Error(`Search API error: ${error}`)
          }

          if (searchResult["products"].length > max_results) {
            searchResult["products"].splice(0, max_results)
          }

          let all_images_objects: string[] = [];
          searchResult.map((product, index: number) => {
            let images = product["images"]
            if (images.length > 0) {
              const imageUrl = product["images"][0]["src"]
              all_images_objects.push(imageUrl)
            }
          })
          
          if (hasError) {
            fullResponse += `\nAn error occurred while searching for "${search_query}.`
            uiStream.update(
              <Card className="p-4 mt-2 text-sm">
                {`An error occurred while searching for "${search_query}".`}
              </Card>
            )
            return searchResult
          }
          uiStream.update(
            <Section title="Images">
              <SearchResultsImageSection
                images={all_images_objects}
                query={search_query}
              />
            </Section>
          )
          // uiStream.append(
          //   <Section title="Sources">
          //     <SearchResults results={results} />
          //   </Section>
          // )

          uiStream.append(answerSection)

          return searchResult
        }
      }
    }
  })

  const toolCalls: ToolCallPart[] = []
  const toolResponses: ToolResultPart[] = []
  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text-delta':
        if (delta.textDelta) {
          // If the first text delata is available, add a ui section
          if (fullResponse.length === 0 && delta.textDelta.length > 0) {
            // Update the UI
            uiStream.update(answerSection)
          }

          fullResponse += delta.textDelta
          streamText.update(fullResponse)
        }
        break
      case 'tool-call':
        toolCalls.push(delta)
        break
      case 'tool-result':
        toolResponses.push(delta)
        break
      case 'error':
        hasError = true
        fullResponse += `\nError occurred while executing the tool`
        break
    }
  }
  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: fullResponse }, ...toolCalls]
  })

  if (toolResponses.length > 0) {
    // Add tool responses to the messages
    messages.push({ role: 'tool', content: toolResponses })
  }

  return { result, fullResponse, hasError }
}

async function shopifyStoreSearch(
  storeUrl: string,
  query: string,
): Promise<> {

  const url = `${storeUrl}/products.json`
  const response = await fetch(url, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Error: ${response.status}`)
  }

  const products = await response.json()["products"]

  const matchedProducts = []

  // Get all the matched products (simplified products, removing all stupide information)
  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const productImages = product["images"]
    if (product["title"].includes(query)) {

      const title = product["title"]
      const description = product["body_html"]
      const productType = product["product_type"]
      const tags = product["tags"]

      const imagesArray = []
      for (let i = 0; i < productImages.lengh; i++) {
        const currentImage = productImages[i]
        imagesArray.push(currentImage["src"])
      }

      // Only use the first image
      const image = imagesArray[0]

      const matchedProduct = {
        title: title,
        description: description,
        productType: productType,
        tags: tags,
        image: image,
      }
      matchedProducts.push(matchedProduct)
    }
  }

  return matchedProducts
}

