// --- CONFIGURATION CONSTANTS ---

const MONDAY_API_KEY = process.env.MONDAY_FRANCHISE_API_KEY;

const MAIN_BOARD_ID = 2046517792;
const MONDAY_GROUP_ID = "topics";

const FRANCHISEE_BOARDS = {
  "Franchisee A": 1234567890,
  "Franchisee B": 9876543210,
};

// --- HELPER FUNCTION ---

/**
 * Executes a GraphQL query/mutation against the monday.com API using variables.
 */
const mondayCall = async (query, variables = {}) => {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json();
  if (data.errors) {
    console.error("❌ Monday API returned errors:", JSON.stringify(data.errors, null, 2));
    throw new Error(`Monday API Error: ${data.errors[0].message}`);
  }
  return data;
};

// --- MAIN HANDLER ---

module.exports = async (req, res) => {
  if (!MONDAY_API_KEY) {
    console.error("❌ MONDAY_API_KEY not set!");
    return res.status(500).json({ error: "Missing Monday API Key" });
  }

  if (req.method === "GET") return res.status(200).json({ message: "✅ Webhook online" });
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const submission = req.body;
    console.log("👉 Raw submission received:", submission);

    // Extract relevant Cognito fields
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
      JobBookedOnBehalfOfTheAgentBy,
    } = submission;

    const itemName = `${BookingReference}`;
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
        console.warn(`⚠️ No board mapping found for ${franchiseeName}, using main board.`);
      }
    }

    // Prepare Monday column values
    const columnValues = {
      date_mkvmvx73: { date: JobDate },
      text_mkvmjq0e: [
        PropertyAddress?.Line1,
        PropertyAddress?.City,
        PropertyAddress?.PostalCode,
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
      color_mkvmmvy7: JobBookedOnBehalfOfTheAgentBy,
    };

    Object.keys(columnValues).forEach((key) => columnValues[key] == null && delete columnValues[key]);

    // --- Step 1: Search for existing item --- (Updated for new Monday API schema)
const searchQuery = `
  query ($boardId: Int!, $itemName: String!) {
    items_page_by_column_values(
      board_id: $boardId,
      columns: [{ column_id: "name", column_values: [$itemName] }],
      limit: 1
    ) {
      items { id }
    }
  }
`;

    const searchData = await mondayCall(searchQuery, {
      boardId,
      itemName,
    });

    const existingItem = searchData?.data?.items_page_by_column_values?.items?.[0];

    // --- Step 2: Create or Update ---
    if (existingItem) {
      const updateQuery = `
        mutation ($boardId: Int!, $itemId: Int!, $columnValues: JSON!) {
          change_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id
          }
        }
      `;

      const updateData = await mondayCall(updateQuery, {
        boardId,
        itemId: parseInt(existingItem.id),
        columnValues,
      });

      console.log("✏️ Updated existing item:", updateData.data.change_column_values.id);
      return res.status(200).json({ message: "✅ Updated existing item", id: existingItem.id });
    } else {
      const createQuery = `
        mutation ($boardId: Int!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
          create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
            id
          }
        }
      `;

      const createData = await mondayCall(createQuery, {
        boardId,
        groupId: MONDAY_GROUP_ID,
        itemName,
        columnValues,
      });

      console.log("➕ Created new item:", createData.data.create_item.id);
      return res.status(200).json({ message: "✅ Created new item", id: createData.data.create_item.id });
    }
  } catch (error) {
    console.error("❌ Fatal Webhook Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
