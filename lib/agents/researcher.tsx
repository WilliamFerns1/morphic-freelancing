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
  console.log("Starting researcher function...");

  const openai_api_key = process.env.OPENAI_KEY
  const openai_api_model = process.env.OPENAI_API_MODEL

  console.log("API KEY: ", openai_api_key);

  console.log("API KEY & MODEL:", openai_api_key, openai_api_model);

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

  console.log("Store Name:", storeName);
  console.log("Store URL:", storeUrl);

  const result = await experimental_streamText({
    model: openai.chat(openai_api_model || 'gpt-4-turbo'),
    maxTokens: 2500,
    system: `As a professional shopify product search expert, you possess the ability to search for any information on the ${storeName} shopify store. 
For each user query, utilize the product results to their fullest potential to provide additional information and assistance in your response.
Aim to directly address the user's question, augmenting your response with insights gleaned from the search results.
Please match the language of the response to the user's language. The way you get the keywords if needed to get search for product data, it should be minimalistic, meaning that you should keep each keyword in the string array as short as possible. Here is an example: instead of using "55 inch tv" as a keyword extract it to be as minimalistic as possible: ["55 inch", "tv"]`,
    messages,
    tools: {
      search: {
        description: 'Search the shopfiy store for specific products',
        parameters: searchSchema,
        execute: async ({
          keywords,
          max_results,
        }: {
            keywords: string[],
            max_results: number,
          }) => {
          console.log("Executing search tool...");
          console.log("Keywords:", keywords);
          console.log("Max Results:", max_results);
          const keywordsString = keywords.join(", ")
          uiStream.update(
            <Section>
              <ToolBadge tool="search">{keywordsString}</ToolBadge>
            </Section>
          )

          uiStream.append(
            <Section>
              <SearchSkeleton />
            </Section>
          )

          if (storeUrl.length < 5) {
            throw new Error(`Store url invalid`)
          }

          let searchResult;

          try {
            console.log("Starting Shopify store search...");
            searchResult = await shopifyStoreSearch(
              storeUrl, 
              keywords,
            )
          } 
          catch (error) {
            console.error('Search API error:', error)
            hasError = true
            throw new Error(`Search API error: ${error}`)
          }

          if (searchResult.length > max_results) {
            searchResult.splice(0, max_results)
          }

          let allImages: string[] = [];
          searchResult.map((product, index: number) => {
            let imageUrl = product["image"]
            if (imageUrl) {
              allImages.push(imageUrl)
            }
          })

          if (hasError) {
            fullResponse += `\nAn error occurred while searching for "${keywordsString}.`
            uiStream.update(
              <Card className="p-4 mt-2 text-sm">
                {`An error occurred while searching for "${keywordsString}".`}
              </Card>
            )
            return searchResult
          }
          uiStream.update(
            <Section title="Images">
              <SearchResultsImageSection
                images={allImages}
                query={keywordsString}
              />
            </Section>
          )

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

  console.log("Researcher function completed.");

  return { result, fullResponse, hasError }
}

async function shopifyStoreSearch(
  storeUrl: string,
  keywords: string[],
): Promise<any> {

  const url = `${storeUrl}/products.json?limit=1000`
  console.log("Shopify API URL:", url);

  const response = await fetch(url, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Error: ${response.status}`)
  }

  console.log(`Before fetching products with products.json method`)
  const result = await response.json()
  console.log(`Results: ${result}`)
  const products = result["products"]
  console.log(`A total of ${products.length} was found`)

  const matchedProducts = []

  // Get all the matched products (simplified products, removing all stupide information)
  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const productImages = product["images"]
    const productTitle = product["title"]
    console.log(`Product title: ${productTitle}`)
    for (let j = 0; j < keywords.length; j++) {
      const keyword = keywords[j]
      console.log(`Keyword: ${keyword}`)
      if (productTitle.toLowerCase().includes(keyword.toLowerCase())) {

        const title = product["title"]
        const description = product["body_html"]
        const productType = product["product_type"]
        const tags = product["tags"]
        const variants = product["variants"]
        const options = product["options"]

        const imagesArray = []
        for (let i = 0; i < productImages.length; i++) {
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
          variants: variants,
          options: options,
        }
        matchedProducts.push(matchedProduct)
        break
      }
    }
  }
  console.log(`${matchedProducts.length} products found.`)
  return matchedProducts
}
