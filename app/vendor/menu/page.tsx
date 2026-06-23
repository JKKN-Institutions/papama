"use client";

import { useVendorFetch, PageHeader, ListStates, TableShell, TableHead, StatusBadge, Dash } from "../_ui";

interface MenuItem {
  id: string;
  item_name: string;
  price: number;
  approval_status: string;
  is_special_care_equivalent: boolean;
}

export default function VendorMenuPage() {
  // GET /api/vendor/menus → { menus: [...], total }
  const { data: menus, state, errorMsg } = useVendorFetch<MenuItem[]>(
    "/api/vendor/menus",
    "menus",
    "/vendor/menu"
  );

  const items = menus ?? [];

  return (
    <div>
      <PageHeader
        title="My menu"
        subtitle="Your menu items and their approval status."
        count={state === "ready" ? items.length : undefined}
      />

      <ListStates
        state={state}
        errorMsg={errorMsg}
        isEmpty={items.length === 0}
        resourceLabel="menu items"
        emptyHint="Add menu items during onboarding — they appear here once submitted for approval."
      >
        <TableShell>
          <TableHead columns={["Item", "Price", "Approval", "Special care"]} />
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Dash>{item.item_name}</Dash>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {item.price != null ? `₹${item.price}` : <Dash>{null}</Dash>}
                </td>
                <td className="px-4 py-3">
                  {item.approval_status ? (
                    <StatusBadge value={item.approval_status} />
                  ) : (
                    <Dash>{null}</Dash>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.is_special_care_equivalent ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </ListStates>
    </div>
  );
}
