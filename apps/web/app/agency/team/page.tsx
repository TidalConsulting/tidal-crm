import { listTeam, ROLE_LABELS } from "@tidal/core";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, Td, Th } from "@/components/ui/table";
import { getAppContext, inAgency } from "@/lib/context";
import { inviteMember, revokeMember, updateMemberRole } from "../actions";

export const metadata = { title: "Team" };

export default async function Team() {
  const { agency, locations, user } = await getAppContext();
  const team = await inAgency((tx) => listTeam(tx));
  const isAdmin = agency?.role === "agency_admin";

  return (
    <>
      <PageHeader title="Team" description="Agency roles apply to every sub-account. Sub-account roles apply to one company." />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Access</Th>
              </tr>
            </thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.userId} className="align-top">
                  <Td>
                    <div className="font-medium">{u.name ?? "—"}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </Td>
                  <Td>
                    <ul className="grid gap-1">
                      {u.memberships.map((m) => {
                        const agencyScope = !!m.agencyId;
                        const options = agencyScope ? (["agency_admin", "agency_viewer"] as const) : (["location_admin", "user"] as const);
                        return (
                          <li key={m.membershipId} className="flex flex-wrap items-center gap-2">
                            <span className="w-44 truncate text-sm">{agencyScope ? "Agency (all sub-accounts)" : m.locationName}</span>
                            {isAdmin && u.userId !== user.id ? (
                              <>
                                <form action={updateMemberRole.bind(null, m.membershipId)} className="flex items-center gap-1">
                                  <Select name="role" defaultValue={m.role} aria-label="Role" className="h-7 w-44 text-xs">
                                    {options.map((r) => (
                                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                    ))}
                                  </Select>
                                  <Button type="submit" variant="secondary" size="sm">Update</Button>
                                </form>
                                <form action={revokeMember.bind(null, m.membershipId)}>
                                  <Button type="submit" variant="ghost" size="sm">Remove</Button>
                                </form>
                              </>
                            ) : (
                              <span className="text-xs text-muted">{ROLE_LABELS[m.role]}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {isAdmin ? (
          <Card className="self-start">
            <CardHeader title="Give someone access" description="They sign in with Google using this email." />
            <ActionForm action={inviteMember} submitLabel="Grant access" className="grid gap-3 p-4">
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" />
              </Field>
              <Field label="Scope" htmlFor="scope">
                <Select id="scope" name="scope" defaultValue="agency">
                  <option value="agency">Agency (all sub-accounts)</option>
                  {locations.filter((l) => !l.archivedAt).map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Role" htmlFor="role" hint="Agency scope: agency admin or viewer. Sub-account scope: admin or user.">
                <Select id="role" name="role" defaultValue="agency_viewer">
                  {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
