// --- CONFIGURATION CONSTANTS ---

// 1. Standardized API Key: Ensure MONDAY_API_KEY is set in Vercel Environment Variables.
const MONDAY_API_KEY = process.env.MONDAY_FRANCHISE_API_KEY; 

// 2. Board IDs
const MAIN_BOARD_ID = 2046517792;
const MONDAY_GROUP_ID = "topics";

const FRANCHISEE_BOARDS = {
  "Franchisee A": 1234567890, // UPDATE WITH CORRECT BOARD ID
  "Franchisee B": 9876543210, // UPDATE WITH CORRECT BOARD ID
};


// --- HELPER FUNCTION FOR MONDAY API CALLS ---

/**
 * Executes a GraphQL query/mutation against the monday.com API.
 * @param {string} query The GraphQL string.
 * @returns {Promise<object>} The JSON response data from monday.com.
 */
const mondayCall = async (query) => {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_API_KEY // Uses the standardized API Key
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();
  
  // LOG Monday API Errors if they exist
  if (data.errors) {
    console.error("❌ Monday API returned errors:", JSON.stringify(data.errors, null, 2));
    // Throw an error to be caught by the main try/catch block
    throw new Error(`Monday API Error: ${data.errors[0].message}`);
  }
  
  return data;
};


// --- VERCEL SERVERLESS HANDLER ---

// This is the single, correct CommonJS export for Vercel.
module.exports = async (req, res) => {
  
  // Basic Health/Security Checks
  if (!MONDAY_API_KEY) {
    console.error("❌ MONDAY_API_KEY environment variable is not set!");
    return res.status(500).json({ message: "Server configuration error: Missing API Key." });
  }

  if (req.method === "GET") {
    return res.status(200).json({ message: "✅ Webhook online" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // Main Logic Block wrapped in a single try/catch
  try {
    const submission = req.body;
    console.log("👉 Raw submission received.");

    // Destructuring Cognito Forms Data
    const {
      BookingReference,
      JobDate,
      PropertyAddress,
      EstateAgency,
      EstateAgency2,
      BookingType,
      NoOfBedrooms,
      PropertyType,
      PropertyAvailableDate,
      StartOfTenancy,
      Id,
      Comments,
      AgentsName,
      AgentsEmail,
      LettingType,
      LeadTenantName,
      LeadTenantEmail,
      LeadTenantPhone,
      Price,
      AreYouAFranchiseeBookingOnBehalfOfTheAgent,
      JobBookedOnBehalfOfTheAgentBy
    } = submission;

    const itemName = `${BookingReference}`;

    // 1. Determine Board ID (Franchisee Logic)
    let boardId = MAIN_BOARD_ID;
    const franchiseeAnswer =
      typeof AreYouAFranchiseeBookingOnBehalfOfTheAgent === "string"
        ? AreYouAFranchiseeBookingOnBehalfOfTheAgent.toLowerCase()
        : AreYouAFranchiseeBookingOnBehalfOfTheAgent?.Choice?.toLowerCase() || "no";

    if (franchiseeAnswer === "yes" && JobBookedOnBehalfOfTheAgentBy) {
      const franchiseeName = JobBookedOnBehalfOfTheAgentBy.trim();
      if (FRANCHISEE_BOARDS[franchiseeName]) {
        boardId = FRANCHISEE_BOARDS[franchiseeName];
      } else {
        console.warn(`⚠️ No board mapping found for franchisee: ${franchiseeName}, using MAIN_BOARD_ID.`);
      }
    }

    // 2. Prepare Column Values (Check all column IDs against your NEW Monday.com Board)
    const columnValues = {
      date_mkvmvx73: { date: JobDate },
      text_mkvmjq0e: [
        PropertyAddress?.Line1,
        PropertyAddress?.City,
        PropertyAddress?.PostalCode
      ].filter(Boolean).join(", "),
      color_mkvmxaw7: { label: EstateAgency },
      text_mkvn2yd1: EstateAgency2 || "",
      color_mkvta8zc: { label: BookingType },
      numeric_mkvng45g: NoOfBedrooms?.toString() || "",
      text_mkvn9w2j: PropertyType,
      date_mkvna7n0: PropertyAvailableDate ? { date: PropertyAvailableDate } : null,
      date_mkvn9hrb: StartOfTenancy ? { date: StartOfTenancy } : null,
      numbers23: Id?.toString() || "",
      text_mkvn7ezz: { text: Comments || "" },
      text_mkvnwr1x: AgentsName,
      email_mkvnbepp: { email: AgentsEmail, text: AgentsEmail },
      text_mkvnw80g: LettingType,
      text_mkvndvdh: LeadTenantName?.FirstAndLast || "",
      email_mkvnphs3: { email: LeadTenantEmail, text: LeadTenantEmail },
      phone_mkvn19xx: { phone: LeadTenantPhone, countryShortName: "GB" },
      numeric_mkvnx5tt: Price ? parseFloat(Price.replace(/[^0-9.]/g, "")) : 0,
      color_mkvmmvy7: JobBookedOnBehalfOfTheAgentBy
    };

    // Remove null/undefined values before JSON stringify
    Object.keys(columnValues).forEach(
      key => columnValues[key] == null && delete columnValues[key]
    );

    // ... after Object.keys(columnValues).forEach(...)
// ...

// Use a cleaner function to handle all necessary escapes for GraphQL string arguments
const escapeGraphQLString = (str) => {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")   // Escape backslashes first
    .replace(/"/g, '\\"')     // Escape double quotes
    .replace(/\n/g, "\\n");   // Escape newlines (optional)
};

// Apply escaping to your dynamic data
const stringifiedColumnValues = escapeGraphQLString(JSON.stringify(columnValues));
const escapedItemName = escapeGraphQLString(itemName);

    // 3. Search for Existing Item (Uses the new mondayCall helper)
    // New, required query name:
const searchQuery = `
  query {
    items_page_by_column_values( 
      board_id: ${boardId},
      column_id: "name",
      column_value: "${escapedItemName}"
    ) {
      items { // <-- Monday now returns a 'page' object containing an 'items' array
        id
      }
    }
  }
`;

    const searchData = await mondayCall(searchQuery);
    const existingItem = searchData?.data?.items_page_by_column_values?.items?.[0];

    if (existingItem) {
      // 4a. Update existing item
      const updateQuery = `
        mutation {
          change_column_values(
            board_id: ${boardId},
            item_id: ${existingItem.id},
            column_values: "${stringifiedColumnValues}"
          ) {
            id
          }
        }
      `;

      const updateData = await mondayCall(updateQuery);
      console.log("✏️ Updated item:", updateData.data.change_column_values.id);

      return res.status(200).json({
        message: "✅ Item successfully updated in Monday.com",
        itemId: updateData.data.change_column_values.id
      });
    } else {
      // 4b. Create new item
      const createQuery = `
        mutation {
          create_item(
            board_id: ${boardId},
            group_id: "${MONDAY_GROUP_ID}",
            item_name: "${escapedItemName}",
            column_values: "${stringifiedColumnValues}"
          ) {
            id
          }
        }
      `;

      const createData = await mondayCall(createQuery);
      console.log("➕ Created new item:", createData.data.create_item.id);

      return res.status(200).json({
        message: "✅ New item successfully created in Monday.com",
        itemId: createData.data.create_item.id
      });
    }
  } catch (error) {
    // This catches both internal errors AND errors thrown by mondayCall
    console.error("❌ Fatal Error in Webhook:", error.message);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
