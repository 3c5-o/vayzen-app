import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const MAX_VIDEO_BYTES = 800 * 1024 * 1024;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
function envMap(name:string){
  try{return JSON.parse(Deno.env.get(name) ?? "{}") as Record<string,string>;}catch{return {};}
}
const secretMap = envMap("SUPABASE_SECRET_KEYS");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretMap["default"] ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const BOT_SECRET = Deno.env.get("TELEGRAM_BOT_SECRET") ?? "";
const STREAM_GATEWAY = Deno.env.get("STREAM_GATEWAY") ?? "";
const STREAM_SIGNING_SECRET = Deno.env.get("STREAM_SIGNING_SECRET") ?? "";
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const BOT_UI_ICON_VERSION = 1;
const BOT_UI_ICON_KEYS = ["movie","series","episodes","content","requests","report","users","stats","admin","search","settings","back","cancel","delete","check","edit","quality"] as const;
type BotUiIconKey = typeof BOT_UI_ICON_KEYS[number];
const BOT_UI_ICON_PNGS:Record<BotUiIconKey,string>={
  movie:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABWklEQVR42u3csVHDMBSA4UjnBehgALL/PixABxuIigLukgvIz3qyvq9M4dj6LcvOJblcAAAAAAAAzq0Ygp8+nl/b79ee3t8OG6cqQS6CCII15A/rxaOi1hUzxCULQQTBou7BkCmDtNbaTNsdbTsixExRPl+uD79PKaWkD3LWM/fese4Zpoix00DuFKWKkev4qxi5olQxckXZIneulFKi7lBGbzfqRKxRZ8P3AdwaoN4DGr3de+F79qFGzYxMgzciSton9bM9yUevmYcFiZris2031QyJmOIzbjfsSd0t7/4xffyejCCCIIgg/FfIZ1kjbhfP8mBrhrhkIYggCCIIggiCIIIgCIIIgiCCIIggCCIIgiCIIAgiCBMEWeVnChHH2RVk1K+Mssfo+ebmNtsZ5JLVMUtW1DseNcNOiBGwqK8eJd2/Aa0cJe3/Za22oLtUAwAAAAAAAADL+gIQ9rGeqO2lNAAAAABJRU5ErkJggg==",
  series:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABSklEQVR42u3dsW3DMBBAUZHwAu6SAZz998kC6ZwNmN6AhRQ8gXd8r0wTUd8URQZwjgMAAAAAAJisuQXvPT8e4/Vn95/v0HvW3fa1CLKY2xW/ZIwxMt6c38+vWkGyhvjPmFprIWtJF2Ot8TUx5jyaZr19dTOj8FuWGEnesiIXwagNYPoZcjY7Vo6x2tOhRV9Q5hjvjk4ix2qnXnlRRxBBEGQr3rIWG6sZsutOPXIzVelkwQyxqCOIIKRc1Hc4BTZDBEEQQRBEEARBEBvDE057zRCPLAQRhCKLutNeM0QQBBEEQQRBEEHYfGN49Wlvho2oGSIIgghCykXdaa8ZIgiCCIIggiCIIBGqfQ9j9HimBTnb5FWJcsXXGN6qfLI8sgI/JdnMHHdf+eJ2ixG2qO8SJWKcPdPFVo9xHBf9y6NKC7o/GQAAAAAAAFDKH7BSavpDd2qXAAAAAElFTkSuQmCC",
  episodes:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABmElEQVR42u3cwVXDMBBFUdvHDbBLA+m/IBpglxLEih1wDsGK/kj3NRApT+M/49jZNgAAAAAAAAAAcDF7ykJaa63cl7fv+3RCKoroKWYnIkvMQUbWvo4Na4f6T6eoR0BW3EtEhVSU0Wvdx+gTVVXGb+v/T5bIkDAICeMc3f6ltMApl85zlIjUjmm0mHN1EWliDjKy9iXUZwr1v06qyXPId2trrbVXr+/yCjF1DxKSdtoft3vrIeXVWTJVhjxu93aFGJM6MWt0WRWlTN/2VquWZeaQKmKWGwzTxSw7qadKWfrWSWK1uJcVJuakY9vePt53FUKGCkkWsXSFpMpYrkKSRSwlpIKIZS5ZlWRMXSHVRExdIVVlTFchlUV88fQGnvlNvcLT76P35V6WDAEhhKCEkIQH0RKagPgKqSqlx7r3ESdj1lcYrmjjZYhQr/8qdM99naMX79+AQoTMIKZHpZ8zby6hjRXqQh0RQkzdRSrE1D1oUjd1yxAZYuoueMma7fI1+oB1+XBTNwAAAAAAAAAAAAAAAAAAQAU+AZun47EmP1RSAAAAAElFTkSuQmCC",
  content:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABIElEQVR42u3bURLCIAwFQPD+d8YL6Idt4jzo7gFo8NnUkWYMAAAAAACAs82ORddaq6zAOeeT6pupG+3YeHp9Y4zx2iGMivXT6ysNpHuzd6+TXl/LHULIM+Tbt6Kz5/+ydnp9f7lDqh5wHb+w0uvTssIIRCAIRCAIRCAIRCAIRCAIBIEIBIEIhD0CqTrD7joLT65vJn9wHwu+cEqXXp+WdXrL6jr7rrpOen0td0j3pu+un15f6TOks2c/7d1eAAAAAL7yX1ZYfebUw4Ixpx62f3PqYaE4wj3toW5OvXZtc+ph9WlZYQQiEAQiEAQiEAQiEAQiEASCQASCQATCHoGYU7/OnHpAfVrW6S3LnHrddcyph+3fu72bdAcAAAAAAOCyN9y1wGv65d7+AAAAAElFTkSuQmCC",
  requests:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAACAUlEQVR42u2bQXKDMBAEkYoP5JY8IPn/f/KB3JIfkJMvKUOMtSvNoO6jyyWz0wIJsywLAAAAAAAAAAAAAAAEU9wL+H593+59/vL1aVlbZU4iBBCCEEAIQgAhCIHOrJmDb9u2ZRfw8/Yx5LdLKcVGSA8Ro7nVGC2mIkOr3ooMrborMrTqr8jQkrJmH2TWbuTG3t/vmb+bOQFr5sFlyxjFUV2tsqrrmaEs5fJ36nuXpVHjZFJdZLSGGTXO1EL+hvdsmFHjTC1kL7SzYUaNM72Qo66RR8M8+p5qV4r0JatFiqOMZQnoy9rbd0duCyMvL5EyMmq32PZGhejQPGfzxLA1TJdORqtHuM+G6tRWavdM/Wy4bj2+lk0Oj4bs2HBt23XyX9h0vwtJcZVhL+Re+M4ybG4MVZn2xnAmEIIQQAhCACEXIa1R7tn+pBHbZaXOS7kzpHc4am2wkpesXiEp9iSzhiBEY/aqduxLnyFZoSm/PpG2yzqzW1IKaPRxV/UQootWf32iOszMKCkO77JIrSGZUlxeLFoXI2Z4l1Ful9V7tqo92ZTc9vYKSfExM3fqswhpvd5nz97W8bPWs5IdfkSwkcVnH0/r+EXhbLgSrUKqyqxDRvAaMruUqPqr4kHNKiNllzWblOh6U8O78mLPugkAAAAAAAAAAAAAAAAAAAAAADv8ApY4C4LXW87/AAAAAElFTkSuQmCC",
  report:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABnElEQVR42u3csXUDIRBFUUEHztyA+y/IDThzCevUiS0daRf+wH2pAi183sDoLLrdAAAAAAAAAAzlOI7DLISFsUIoXZy4tFRVt4QhuH4jr2wJQzDmmFvVEoZgXBOoWQzsyKuFomRhnB0VLWEIxtpRzRKGYN7qrmAJQzB3VWsWAycvORQlCxmrONUShoTRUu1ord19tu/3jz9X+dvXZzvrexiyMb2qHaeUh9Za2l7CEIZk1fQ0S/rOYSSGomQpWZnHzxRLGMKQ3OYswRKGMCTTjhRLGBIWSmeHklUijFmWKFm7G1KpVM2whCE7G1JxIx9tCUN2NaTyMXekJV0YWaEoWbuVrJU68sSXIp4KZKUVXHo8q75pfuW47CG7sPo9jKvGxxB2GKeHLDReJSut11mhCfx9T+SReyHJzW/pQF69sJM47l7djogyc+JPKmX3kP/seOTzVDo7sixxylrNkFl23Nu0Z5y2zrCkVwxj5dLVVghkdh8SMS/+Veea+bGp75y+eWKI1PHafDEk7djMjnH9iVkAAAAAAAAAAABAHD81smfLipkGmAAAAABJRU5ErkJggg==",
  users:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAB+ElEQVR42u3b227DIBBFUQ/y//8yfUmlKkpcg+fGsNdrW+z4MBgIPQ4AAAAAAAAAAADAkWS4id57v7xJESGQBEHsGIysEMROwbTVwtBqg0CUH2TVUNqKYVQORbKE8e298ORvCcRwSrvL1PgM7Q0DD1FExHvYiwhZoqpj9sNqtTkSrmcwLXtlWDyc0UrznDy0iOqIumZ/mW3b4zO1lapjh5X6eWxi9N3z7fd7792yQ7Sdw5CX0Z9ZDl3t2NTdXu49PLZdqyNru43q2HwdwvZ7UCAh2w4FpsMhQ9aTHl65OswDueqxMw8220ZguZf6SCiR3zaW2Mu623P/2yO6s4d0dQ2ryjFrd/X1wJ0Hc7VSt/zb1IFYhKL1/cfIXpb1+8r9RagVysxD0bi29eThXLU6/rbHIYekMxStAxOR0+pWJYyR62Xey5IKQVhVS4lTJ5m2Nu6sgUpXyGwYT9YDI21HzvDcA/H8X48sVWgRjHiGYfEBVnpfucyyosfhDGsQzU5hfgrQ84FFV4vKmbMqYVgt+LwXkbJjGB4TitlrbHsu68mwlO7k4upDlceu7+w1lq+QyBe5RSjN+yYrDmHhQ9YK1eG6/6R4uqZp3kCW6vi9j0/3Y/VS1mqzxPDy3gujOkaW+wAAAAAAAAAAAAAAAAAAAAAAAAAAAMBDP0iJcEufzW3GAAAAAElFTkSuQmCC",
  stats:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABAklEQVR42u3bTRLBMBiA4cY4ADsOwP3PwwHY6Q1ij8x0EvKjz7POwuT1tSbaaQIAAAAAAAAAPgm24F2MMSY3LIQgSAchaoXZyNAXQTKmI2e9ICYEQQRBEEEQBEEEQRBBKLYd+cM/DqfkedL+fh3yJDv8W4jcMDmHhb84gnfJcg+pNx056wVBEEEQRBAEEQRBBEEQBBEEQYZU5Q+qlu9bCLIwxOsaYVyy1hWkl/ctBEEQQRBEEARBEEEQRBAEEQRBBEEQQWyBIAgiCIIIgiCCIMi6FT++2eIBt/l4Xrx2d7vU39SCx2JNiAmpMyktJuMbEzJ0kG6/5S5ZfmUBAAAAAABJT2exRsf3KjunAAAAAElFTkSuQmCC",
  admin:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAACLElEQVR42u2cQW7DMAwETaMf6K0f6P8f1A/01ieopxRBAKexRUlLcuZYpI64q5UoO/C2AQAAAAAAAIAOlqGI1lr7K8jMMETIhNvfoxpjUY34T/CoqbHIaci4pFlWE3oThiGTBVNNjWVOQ0RzrKoJqkuaVStYfcJY5TQojt8wQSvhFm3A1Ze0UwO8H2QlJGuvaoZ3/fsGUmAIhgD7SKC63yIL8fPxeSjE+/cXD6haa21GT/7MiBXGeNa9Z0qFx+dJyERhR6WldEKyEyIhZzfv2Zu9Z93yhhyJ+4qwPf/LkjVgL4jY+roaYmbmeUga1SF5Xtd7VdizpiNqSuiyMAQwBEOgjCHZ72VJGzKqQ1LuvEI+D4k265cmxPtw6D2bPa834lbRXi0N6umSfT4wQ7jetJRJyKxZrJgWqYSsFOhKWkYkRMaQV8x4FO3Mg6gr119hSIi290ioMwLePsum3pGOkQc4j+9MuamvMOPZ9VcnaIghvYfDWbc2er5n1A86dsV0VGm7p+0hZ2fQvQArbvxd+f5ZP5t1NWRLzKj6eEBViawpGVkXCSEl1EMR1JGvkHT7YfSCUjYoUYtKfaaKVtzs8dL2QpyUlHoRgnqxq8bHkgX6KSn97i+14qu/iE1KgPJmqAmBIUJiYIaQKEpm0PaC1mxlqRISCTNOijVKsMpv4ZabxRghJCJmCC0zmCGSFvYLIVMwQsgUzBDZV1iihNKCEQVP9wAAAAAAAABQiV9PBU2JievDRgAAAABJRU5ErkJggg==",
  search:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAB6UlEQVR42u2cwVHEMBAET8qAHwmQf0AkcD9CED+KchVnG1u7M9ruN3XWbWtkdFr78QAAAAAAAAAAAAAAAFibpjqwMcbYHXxrDSGJAioIaiuIWElMW0nECmL6qjIir2ObkMwCuaSlV5DhlJamWowjM3rW5y4t5EzRrhQr6jrWQo4W6c4CZVzT/r+smYVx3xz2zHTMKt6s+4+tEIXfoVylpCxZUcsKO/UDsy66SHvXU0tJXzEZzknpkelQRWncvcos5bcsQAhCDq7DKsvFq3Go3EdICEsWIAQhgBCEAEIQArZCHDZdDptXEsKSBRJC6FxMEOLagqM07l5hljqdZPbo2RZdHLWmC8mbOs+HBAtRaFJzfWh0WkIypTg/wZu+D7lbimsr0s9EUSo4z4cEJOTMlx+/mPH32/F8vX+McglRWkr+kvH2/Ky3MVTqXNwmQykpKUWKTMt2IrwqvkJSSj0fspcEhaSUedfJmWJnJqXU24AcpJR7X5a6lOVeAOYupeQR7pkiR9/oy56pq0op3eSgKKV814maFNqAxKQgREwKQsSkIERMCkLEpCBETApCxKQgREwKQsSkIERMCkLEpCBkkpT/nqMgZIKUK4daCLlZytUTRoTcKEWpA7I0ij3CAAAAAAAAAAAAAJDJN3w7SCVce+tMAAAAAElFTkSuQmCC",
  settings:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAACa0lEQVR42u2dS1LDMBAFMyouwI4LcP8DcQF2HEGsqKICTiw5mnkv7l4HezStry2ZywUAAAAAAAAAAAAA/AnXwHvvfbNQEbblatRJhABCEAIIQQggBCEp6wbnNY+lkJ8COUrJjr1l1y4nKRWxt4qm7iClKvaWXSAHKZWxR2XBLhe9B4HVMS/tsvYErtRSFCrQ8kHdRYpKa06Z9qpLUepa0xaGqlLUxrlQSsBIwR+ZSKW3j6HSRaxuQfeuPxvTUwi5TsBMslaIGYnJfgzZSkymjL3dU+XaSHp3xtIVsejOlHZGGWoLUnkhWclSlBLOMvYO0E7dVzjKePR6RUlKOMk4kjSXJ882mxyOJstlv284tI5byfx6e//zt6+fH7HiXgi5kaT/ROwRoy5EvsualbH1O/Wuq6m3jlkZs7+vXpu8ZC6qRmvnqtocETEaf0Z5D40hjwpw5F3EVm3/PVbs+c3ofTOF2O/tvU70rRmWA2y2Rgg8tZDrMWN0VvU0K/WKQX024aMLxMpBfXram7HA6r33FffJSq5llzVa0NFZ1OjveXQyUZv3JnnmWZbtGJLZhfC010yK0j1OM+092tW4HKXjnbpQ65ATMlqT2XVi0j05TXMtxpCsJCm+PWyqLWF1srauXz34t2oZFVLuyaiU0hRaRqaUvS2jSorVkbZVJ6hOe6Qt61zgyLVOe+hTeW/t6Y5Fq290Vjqy3c4uQ01KQ4aWlIYMLSlln2da/X7j6PWrpsIln2dyODxTFXv655mc/nNBReypn2dy/DcS2bFLfZ7JrfuyFgIIQQggBCGAEIQAQgAAAAAAAAAAAADgCN915/B4Ql2dvQAAAABJRU5ErkJggg==",
  back:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABiElEQVR42u3cwU3EMBRFUTsdzJIG6L8fGmA5HYQ9iIGREPn3vXsbQOTo49iOWMvMzMzMzMzMzMzMzMzMzGxm53meV/78Q4KvGFeiCPLNZFyFIsiDh38FyiHG44f+3yiHGLMW+kOMn9t7b0EKMdZaawsxB6NqQggYNSAUjAoQEkb8GjJ58a6bECJGLAgVIxKEjBEHQseIAknAiAFJwYgAScLAg6RhoEESMZA7ddpRSPSEpGOgQBowMCAtGIg1JHXxRk5IG8boCfmMcX95RT3Y2/vbjpuQxg7CdAhigthgkJQ3JidEEKfEnXo4IuIXaDrLQqwhzz5g8j4Gs6i3oKDeshpQsH9rUxd77D7kmYdMmhT0xjARBb9TT0OJODpJQok5y0pBiTpcTECJO+2lo0Qev5NRYu9DqCjxdw60k+L4G0Pa+VfFFS4JpeZOnYJSeW89+aS48quTyW9gtZ8BTUWp/i7rtyj+z8VBKK4hg1D8n4uDUJq/L8a+EpuZmZmZmZmZmZmZmZmZ/W0fGZTrZW10gBoAAAAASUVORK5CYII=",
  cancel:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAACv0lEQVR42u2du0EEMQxELXVARgP0XxANkFHCEpFxx9mWRqP1TEhwa+t5/MXyGJIkSZIkSZIkSZIkSZIkSVJ/WcdCX9d1vVxBMxOQouDfAZKdAqELHDsVBCsYOx0EGxgTCC4w1hHGTLBQ32kNZDZIkYGp/DYdELb1A+N6xthgVHQTTGUzlgozTDsZyumCMVeO7JmhCwYXFKuC0WHTr6IOztoKT10cOrplscL4fv+4Zsub0XU5E4xHQUHBYIDiKBi7QUE5Y+X7kVBgY8izVhYRlMhu6q+/o7paR7hjBgYKyn+/PwslyiXO5AwUlFd/t8Ipnu2OjKAgYIwxxtvXp2XHAeqQZ61pprJRUKJgZLrEK9xRASXTGZEu8Qp3oKFkwMhyScnWCRIKyhkUQCIXRBlQqmDsxCXFIat2joSCgHGb3d5sKN26KWogu1A6w6AFsgqlO4wxNk4MHw1c0f1qxvZJNIzIWNA6JCt4rM5oAyQyiOww2gCJCGYHGK2A7AS1C4x2QFaC2wlGSyCZe1kCApoCd4Lid4fRDYqfAKMTFD8FRhcoy0AebQtEnpFk7U1FQoneQvI7OOMXRhWU23dZO87oDsXvBOMOUODXEVBjBgIK3XWEyLOPjAG8yik7caHosjJP+rp1X2lAXrUz4tg1A0rWxU+vtCfyDBzllN1uvOxadMU/JERBybwWHQJkpVVkDMzVTomY5JRmcoicuqIaQ5tMDqvXvSIWdxlQZmFELQFg094ZKKhj15nGgMp+Fwpkp5WsbBBmQFn5Pn1miuuJWMv836wKVZ+S5DOdsk2j6+FslewCI0tWXSFGt1SWu+xaNKtbqhtRaSYHNigMjlZW0nFgVtIVJyhvL/HsRZmtyaeUyv1+4HrkuNcRWMEc/X4IExi9sEMCRm9QEcDRK20HrB8kSZIkSZIkSZIkSZIkSZJK9QMSW4Vgy3COuQAAAABJRU5ErkJggg==",
  delete:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABBElEQVR42u3c0Q2CMBiFUdqwgG8u4P4DuYBvjlAX8MmAvX85ZwBS8tHSJoRtAwAAAAAADtaSB/e+P8ZZ1769npH33j2TgiCIIAgiCDiHRJ4hUpxxlrFkeYcgiCAIIgg4h/zHGCPmzNJaa5cNkhQiJUwXI2t8XYyscdplXX3bW2V2zBrvbneT9bBYspzUEUQQBFnEnjy4b7ueX3ZjR13HDLFkIQiCCIIggiCIIAgiCIIgiCAIIgiCCIIggiAIggiCIIIgyFqiPyU96nPP1M9GzRBBEEQQBBEEQZxD5qr2h4dlZkilQ9qM8VqyvEPqzJIZ4+xXutkK4/PPxeLvOAAAAAAAgGo+EUM8jn8LQa8AAAAASUVORK5CYII=",
  check:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAACmklEQVR42u2dyVEEMQxF286AGwmQf0AkwI0QmgM3apjxIllf9vtXqBpZz5LVXq8LIYQQQgghhBBCCCGEBlSyGXzf993dyFIKQAIBZAZUToGQBU45FYQqmHI6CDUwBRBaYEpGGD3OWvU7aYFEl63qZXNRhbHCCWr2LAXS2viINKFkW1FpsELZqWBnBUafHd6VYYmEoTyFEWV7BcaYfV6RUoGhBaUCQwtKVWpcViiyQJ71lqwwWuy3jJIKDC0o9UIP9f3+ETITXYmO/2E8guIdJTUqxLNERi+UcCDKi0xWaaonfc36oxIdbU7/+3fJqZNdoqM1Alr/b8Yv9fTo6ElHb1+fxbudR5e9MzDkBvXs6cobxqh/zCMkQ7qyhGHd3uNSlmKaOhaIOoxhIBnHjwgYI34yjRDV8cMbhmW7t09ZGdLUMUCywQgHErXmoAojFMizNYeVsJVghAFpWXM4EUYIEIs1h11hLAfSu+ZwGoylQKzXHFQLhDRAenplr3MzlrcSKcsDyk4wzIG0zN1YQlGBEb5zcXbuxgJKhsgY8VPYh+EMlN3SlASQUSg7w7iuiSNtlttHPUrWVTCst9EOR4jlGoC18xQiY9Q/MtPvVk7MmKbcgYyWgbPOXA1D7oyhx5LtqFOVImPGL1Wx9/Q6NwKG7LFor40NrU5WGzNm/VGVe9ErZ0fB8NwGVb17hRcURRgW2aJkMVRF3u00S1mrznHvDMN8DNkZyqoMUFUalRWG/Jd61LVGUTBSnA/ZBUrEzUZhx6LVoURdMyVxFatSWRxtr/ugrnCxZKbOw72914H39o5EAjdbC9f03P0u/rHF6wgHfrkf936IKpijX9hRAsMbVCJgeKVNAA7vGG5UNiOEEEIIIYQQQgghhH71AyKMDabf1MftAAAAAElFTkSuQmCC",
  edit:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABh0lEQVR42u3XQU7DMBRF0cZiATBjA+x/P7AAmLGEMIpUIQptQpNn/3NHnVRqfWI7/3SSJEmSJEmSJEmSJElSdp/PL3Pab2rVMdJQmp2RhdKqY6ShNBhZKA1GFkqDkYXSYGShDA/y9PE29TSnlDiyekIpATLP8/z4/trFRN8qYCyfe0BpVTC2omw59oBcwFiLshfGsCC/YdyKsifGkCDXYFyLsjfGcCC3YPyFcgTGUCBrMC4t/lEYQ+2MtR09mX9vqrwzpmmK+/8NBhAYo4GMitElyMgY3YGMjtEVSAWMbkCqYHQBUgkjHqQaRjRIRYxYkKoYkSCVMeJAqmNEgcAIAoERBAIjAGRBgBG0Q2CEgGyBGB0jelKviLE7iGMqCARGEAiMIBAYQSAwgkC2vt5u/T6QOyxmRZS7gPzncVMN5a7ntKk8DGQNStXLPG6HVIdYejj0aYCQ89oL46BJ/ScEGDvfIee7w+IHVHXKliSXunvjyJmqeSYLzyECAkRAJEmSJEmSJEkK6wu9Zjyu2zHnBgAAAABJRU5ErkJggg==",
  quality:"iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAABZElEQVR42u3czVHDMBAGUMtDAXCDAqD/eqAAuEEH5u4ZDCaJvT/vHTM6OPlirWTvaJoAAAAAAAAAABIYES7i8/F5WX/28PE2BBIgiO7BzJHD2DNOIAeE0TGUeaJeDVmW5c//4K+nl19rxU93xP37a/wfdIyR/g5ZF+6uKyxTlkBIEci6ZnRb6p5a1LcK+5YMBf0aRf3ujIv4zx1w6Rc1Ze1YVV17vEBuGEq3JbCnvQAAQMt9iD1Pw0CydLjMwtg/TiAHhBElFG8MKxb1vS+ojnJGh0uJrpMjRe9wMWUFIxCBxFp1RetwKV3Utwr7lks6XFJ2nUTeh5z9fcpPWdk6XFrUkEwdLp72TjpcAADAPqT3HmJkDaJqMHOFMPaME8gBYVQKxRvDijXkFi+osp6J0qrrpMOZKKYsgVAmkA5nooTuOsl4JkrprpOOZ6KEnrI6nokSvoZ0OxPF014AAAAAAAAAIIVvK7mo61cVEiYAAAAASUVORK5CYII="
};
const BOT_UI_ICON_ALTS:Record<BotUiIconKey,string>={
  movie:"🎬",series:"📺",episodes:"🎞️",content:"🗂️",requests:"📥",report:"⚠️",users:"👥",stats:"📊",admin:"🛡️",
  search:"🔎",settings:"⚙️",back:"↩️",cancel:"✖️",delete:"🗑️",check:"✅",edit:"✏️",quality:"🎚️"
};
const publishableMap = envMap("SUPABASE_PUBLISHABLE_KEYS");
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? publishableMap["default"] ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession:false, autoRefreshToken:false },
});

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, authorization, apikey",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"Content-Type":"application/json; charset=utf-8"},
  });
}

async function sha256Text(value:string){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}


function bytesToB64(bytes:Uint8Array){
  let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);
}
function b64ToBytes(value:string){
  const s=atob(value);const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;
}
async function localSecretKey(){
  if(!SERVICE_KEY)throw new Error("Server encryption key unavailable");
  const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("vayzen:tmdb:v1:"+SERVICE_KEY));
  return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function encryptLocalSecret(value:string){
  const key=await localSecretKey();const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(value));
  return `v1.${bytesToB64(iv)}.${bytesToB64(new Uint8Array(cipher))}`;
}
async function decryptLocalSecret(value:string){
  const [version,iv64,data64]=String(value||"").split(".");
  if(version!=="v1"||!iv64||!data64)throw new Error("Invalid encrypted secret");
  const key=await localSecretKey();
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(iv64)},key,b64ToBytes(data64));
  return new TextDecoder().decode(plain);
}
async function tmdbSetting(){
  const {data,error}=await db.from("app_settings").select("value,updated_at").eq("key","tmdb").maybeSingle();
  if(error)throw error;
  return data??null;
}
async function tmdbAccessToken(){
  const row:any=await tmdbSetting();
  const enc=String(row?.value?.token_enc||"");
  if(!row?.value?.enabled||!enc)throw new Error("TMDb غير مربوط. أضف Access Token من إعدادات TMDb.");
  return decryptLocalSecret(enc);
}
async function tmdbApi(path:string,params:Record<string,string|number|boolean|undefined>={},tokenOverride=""){
  const token=tokenOverride||await tmdbAccessToken();
  const url=new URL(TMDB_API_BASE+(path.startsWith("/")?path:"/"+path));
  for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&String(v)!=="")url.searchParams.set(k,String(v));
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,accept:"application/json"},signal:controller.signal});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(String(j?.status_message||`TMDb HTTP ${r.status}`));
    return j;
  }finally{clearTimeout(timer);}
}
async function saveTmdbAccessToken(tokenRaw:string){
  const token=tokenRaw.trim();
  if(token.length<20||/\s/.test(token))throw new Error("Access Token غير صالح.");
  const config:any=await tmdbApi("/configuration",{},token);
  const images=config?.images||{};
  const tokenEnc=await encryptLocalSecret(token);
  const value={
    enabled:true,
    api_base:TMDB_API_BASE,
    token_enc:tokenEnc,
    token_hint:token.slice(-6),
    config:{
      secure_base_url:String(images.secure_base_url||"https://image.tmdb.org/t/p/"),
      poster_sizes:Array.isArray(images.poster_sizes)?images.poster_sizes:[],
      backdrop_sizes:Array.isArray(images.backdrop_sizes)?images.backdrop_sizes:[],
      still_sizes:Array.isArray(images.still_sizes)?images.still_sizes:[],
    },
    verified_at:new Date().toISOString(),
  };
  const {error}=await db.from("app_settings").upsert({key:"tmdb",value,updated_at:new Date().toISOString()});
  if(error)throw error;
  return value;
}
async function tmdbStatus(){
  const row:any=await tmdbSetting();const v=row?.value||{};
  return {configured:Boolean(v.enabled&&v.token_enc),hint:String(v.token_hint||""),verified_at:v.verified_at||null};
}
async function tmdbImageUrl(path:string,kind:"poster"|"backdrop"|"still"="poster"){
  if(!path)return "";
  const row:any=await tmdbSetting();const cfg=row?.value?.config||{};
  const base=String(cfg.secure_base_url||"https://image.tmdb.org/t/p/");
  const sizes=Array.isArray(cfg[kind+"_sizes"])?cfg[kind+"_sizes"]:[];
  const preferred=kind==="backdrop"?"w1280":kind==="still"?"w780":"w500";
  const size=sizes.includes(preferred)?preferred:(sizes.includes("original")?"original":(sizes[sizes.length-1]||preferred));
  return base+size+path;
}
async function tmdbSearch(type:"movie"|"series",query:string){
  const endpoint=type==="movie"?"/search/movie":"/search/tv";
  const j:any=await tmdbApi(endpoint,{query,language:"ar-SA",include_adult:false,page:1});
  return (Array.isArray(j.results)?j.results:[]).slice(0,8);
}
async function tmdbDetails(type:"movie"|"series",id:number){
  const endpoint=type==="movie"?`/movie/${id}`:`/tv/${id}`;
  const append=type==="movie"
    ?"credits,images,videos,external_ids,translations,release_dates"
    :"aggregate_credits,images,videos,external_ids,translations,content_ratings";
  const [ar,en]=await Promise.all([
    tmdbApi(endpoint,{language:"ar-SA",append_to_response:append,include_image_language:"ar,en,null"}),
    tmdbApi(endpoint,{language:"en-US"}),
  ]);
  return {ar,en};
}
function safeIsoDate(v:any){
  const s=String(v||"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;
}
function tmdbMap(type:"movie"|"series",bundle:any){
  const ar=bundle?.ar||{},en=bundle?.en||{};
  const isMovie=type==="movie";
  const title=String((isMovie?ar.title:ar.name)||(isMovie?en.title:en.name)||(isMovie?ar.original_title:ar.original_name)||"").trim();
  const original=String((isMovie?ar.original_title:ar.original_name)||(isMovie?en.original_title:en.original_name)||title).trim();
  const date=safeIsoDate(isMovie?(ar.release_date||en.release_date):(ar.first_air_date||en.first_air_date));
  const year=date?Number(date.slice(0,4)):null;
  const genres=(Array.isArray(ar.genres)&&ar.genres.length?ar.genres:en.genres||[]).map((g:any)=>String(g.name||"").trim()).filter(Boolean).slice(0,12);
  const spoken=Array.isArray(ar.spoken_languages)&&ar.spoken_languages.length?ar.spoken_languages:(en.spoken_languages||[]);
  const lang=String(spoken.find((x:any)=>x.iso_639_1===ar.original_language)?.name||spoken[0]?.name||ar.original_language||en.original_language||"");
  const countries=(Array.isArray(ar.production_countries)&&ar.production_countries.length?ar.production_countries:en.production_countries||[]).map((x:any)=>String(x.name||"").trim()).filter(Boolean).slice(0,3);
  const overview=String(ar.overview||en.overview||"").trim();
  return {
    title,original_title:original,description:overview,release_year:year,genres,language:lang,country:countries.join(" • "),
    duration_minutes:isMovie?(Number(ar.runtime||en.runtime)||null):null,quality:"",
    external_source:"tmdb",external_id:Number(ar.id||en.id),external_metadata:{primary:ar,fallback:en},
    rating:Number(ar.vote_average||en.vote_average)||null,rating_count:Number(ar.vote_count||en.vote_count)||null,
    release_date:isMovie?date:null,first_air_date:isMovie?null:date,
    poster_path:String(ar.poster_path||en.poster_path||""),backdrop_path:String(ar.backdrop_path||en.backdrop_path||""),
  };
}
async function tmdbExisting(type:"movie"|"series",tmdbId:number){
  const table=type==="movie"?"movies":"series";
  const {data}=await db.from(table).select("id,public_id,title,status").eq("external_source","tmdb").eq("external_id",tmdbId).maybeSingle();
  return data??null;
}

async function consumeRateLimit(key:string,action:string,limit:number,windowSeconds:number){
  const now=Math.floor(Date.now()/1000);
  const windowStart=Math.floor(now/windowSeconds)*windowSeconds;
  const keyHash=await sha256Text(key);
  const {data}=await db.from("api_rate_limits")
    .select("request_count")
    .eq("key_hash",keyHash).eq("action",action).eq("window_start",windowStart).maybeSingle();
  const count=Number(data?.request_count||0);
  if(count>=limit)return false;
  const {error}=await db.from("api_rate_limits").upsert({
    key_hash:keyHash,action,window_start:windowStart,request_count:count+1,updated_at:new Date().toISOString()
  },{onConflict:"key_hash,action,window_start"});
  if(error)throw error;
  if(Math.random()<0.02){
    const cutoff=new Date(Date.now()-3*86400000).toISOString();
    db.from("api_rate_limits").delete().lt("updated_at",cutoff).then(()=>{}).catch(()=>{});
  }
  return true;
}

async function tg(method:string,body:Record<string,unknown>){
  if(!BOT_TOKEN) throw new Error("Telegram bot token is not configured");
  const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),
  });
  const j=await r.json();
  if(!r.ok||!j.ok) throw new Error(j?.description||"Telegram API error");
  return j.result;
}


type TelegramInlineButton={text:string;callback_data?:string;url?:string;web_app?:unknown;login_url?:unknown;style?:"primary"|"success"|"danger";icon_custom_emoji_id?:string;[key:string]:unknown};
type TelegramMarkup={inline_keyboard?:TelegramInlineButton[][];[key:string]:unknown};
let botUiIconCache:{expires:number;ids:Partial<Record<BotUiIconKey,string>>}|null=null;

function botUiAssetUrl(name:BotUiIconKey){
  return `${SUPABASE_URL}/functions/v1/vayzen-gateway?action=bot_icon_asset&name=${encodeURIComponent(name)}&v=${BOT_UI_ICON_VERSION}`;
}
async function readBotUiIconIds(){
  if(botUiIconCache&&botUiIconCache.expires>Date.now())return botUiIconCache.ids;
  const {data}=await db.from("app_settings").select("value").eq("key","bot_ui_icons").maybeSingle();
  const value:any=data?.value||{};
  const ids=(value.version===BOT_UI_ICON_VERSION&&value.status==="ready"&&value.icons&&typeof value.icons==="object")?value.icons:{};
  botUiIconCache={expires:Date.now()+5*60_000,ids};
  return ids as Partial<Record<BotUiIconKey,string>>;
}
async function writeBotUiState(value:Record<string,unknown>){
  const {error}=await db.from("app_settings").upsert({key:"bot_ui_icons",value,updated_at:new Date().toISOString()});
  if(error)throw error;
  botUiIconCache=null;
}
function botUiIconKey(button:TelegramInlineButton):BotUiIconKey|undefined{
  const a=String(button.callback_data||"");
  const t=String(button.text||"");
  if(a==="add_movie"||a.startsWith("add_movie_"))return "movie";
  if(a==="add_series"||a.startsWith("add_series_"))return "series";
  if(a==="batch_episode"||a==="add_episode"||a.startsWith("add_episode_for|")||a.startsWith("ae_")||a.startsWith("epi|"))return "episodes";
  if(a==="requests"||a.startsWith("rq|")||a.startsWith("rql|"))return "requests";
  if(a==="reports"||a.startsWith("rp|"))return "report";
  if(a==="users"||a.startsWith("usr|")||a==="user_search"||a.startsWith("usb|"))return "users";
  if(a==="stats")return "stats";
  if(a==="admins"||a.startsWith("adm"))return "admin";
  if(a==="admin_logs")return "content";
  if(a==="system_status"||a==="bot_ui_settings"||a==="bot_ui_setup")return "settings";
  if(a==="tmdb_settings"||a.startsWith("tmdb_")||a.startsWith("content_search")||a==="user_search"||t.includes("بحث"))return "search";
  if(a==="content"||a==="content_movies"||a==="content_series"||a.startsWith("cm|"))return "content";
  if(a.startsWith("q|")||a.startsWith("qa|")||a.startsWith("qv|")||a.startsWith("qr|")||t.includes("الجودات")||t.includes("الجودة"))return "quality";
  if(a.startsWith("ce|")||a.startsWith("cef|")||a.startsWith("epe|")||a.startsWith("sedit|")||t.includes("تعديل"))return "edit";
  if(a==="cancel"||t.includes("إلغاء"))return "cancel";
  if(a==="menu"||t.includes("رجوع")||t.includes("تراجع")||t.includes("القائمة"))return "back";
  if(a.includes("del")||a.startsWith("cd")||a.startsWith("sd")||a.startsWith("qd")||a.startsWith("epd")||t.includes("حذف"))return "delete";
  if(a.startsWith("confirm")||a.includes("|published")||a.includes("|resolved")||a==="tmdb_token_test"||t.includes("نشر")||t.includes("استخدام هذه النتيجة")||t.includes("تم الحل")||t.includes("تفعيل"))return "check";
  return undefined;
}
function botUiButtonStyle(button:TelegramInlineButton):"primary"|"success"|"danger"|undefined{
  const a=String(button.callback_data||"");
  const t=String(button.text||"");
  if(a==="cancel"||a.includes("del")||a.startsWith("cd")||a.startsWith("sd")||a.startsWith("qd")||a.startsWith("epd")||a.includes("|rejected")||t.includes("حذف")||t.includes("رفض")||t.includes("تعطيل"))return "danger";
  if(a.startsWith("confirm")||a.includes("|published")||a.includes("|resolved")||a==="tmdb_token_test"||t.includes("نشر")||t.includes("استخدام هذه النتيجة")||t.includes("تم الحل")||t.includes("إعادة التفعيل"))return "success";
  if(a==="add_movie"||a==="add_series"||a==="batch_episode"||a==="add_episode"||a==="content"||a==="requests"||a==="reports"||a==="users"||a==="stats"||a==="admins"||a==="system_status"||a==="tmdb_settings"||a==="bot_ui_settings"||a.startsWith("content_")||a==="user_search")return "primary";
  return undefined;
}
async function decorateInlineKeyboard(markup?:unknown){
  const raw=markup as TelegramMarkup|undefined;
  if(!raw?.inline_keyboard)return markup;
  const ids=await readBotUiIconIds();
  return {
    ...raw,
    inline_keyboard:raw.inline_keyboard.map(row=>row.map(button=>{
      const style=button.style??botUiButtonStyle(button);
      const iconKey=botUiIconKey(button);
      const iconId=iconKey?ids[iconKey]:undefined;
      return {...button,...(style?{style}:{}),...(iconId?{icon_custom_emoji_id:iconId}:{})};
    }))
  };
}
function stripBotUiIcons(markup?:unknown){
  const raw=markup as TelegramMarkup|undefined;
  if(!raw?.inline_keyboard)return markup;
  return {
    ...raw,
    inline_keyboard:raw.inline_keyboard.map(row=>row.map(button=>{
      const {icon_custom_emoji_id:_icon,...rest}=button;
      return rest;
    }))
  };
}
function markupHasBotUiIcons(markup?:unknown){
  const raw=markup as TelegramMarkup|undefined;
  return Boolean(raw?.inline_keyboard?.some(row=>row.some(button=>Boolean(button.icon_custom_emoji_id))));
}
async function tgWithMarkup(method:string,body:Record<string,unknown>,markup?:unknown){
  const decorated=markup?await decorateInlineKeyboard(markup):undefined;
  try{
    return await tg(method,{...body,...(decorated?{reply_markup:decorated}:{})});
  }catch(err){
    if(!decorated||!markupHasBotUiIcons(decorated))throw err;
    const fallback=stripBotUiIcons(decorated);
    try{
      const result=await tg(method,{...body,reply_markup:fallback});
      const message=err instanceof Error?err.message:String(err);
      await systemLog("warning","Telegram rejected custom button icons; fallback used",{error:message.slice(0,220)});
      return result;
    }catch{
      throw err;
    }
  }
}
async function ensureBotUiIcons(ownerId:number,force=false){
  const {data}=await db.from("app_settings").select("value").eq("key","bot_ui_icons").maybeSingle();
  const current:any=data?.value||{};
  if(!force&&current.version===BOT_UI_ICON_VERSION&&current.status==="ready"&&current.icons)return current;
  if(!force&&current.status==="unsupported"&&current.retry_after&&Date.parse(current.retry_after)>Date.now())return current;
  try{
    const me:any=await tg("getMe",{});
    const username=String(me?.username||"").replace(/[^A-Za-z0-9_]/g,"");
    if(!username)throw new Error("Bot username unavailable");
    const setName=`vayzen_ui_v${BOT_UI_ICON_VERSION}_by_${username}`.slice(0,64);
    let set:any=null;
    try{set=await tg("getStickerSet",{name:setName});}catch{}
    if(!set){
      const stickers=BOT_UI_ICON_KEYS.map(key=>({
        sticker:botUiAssetUrl(key),format:"static",emoji_list:[BOT_UI_ICON_ALTS[key]],keywords:["vayzen",key]
      }));
      await tg("createNewStickerSet",{
        user_id:ownerId,name:setName,title:"VAYZEN Interface Icons",stickers,
        sticker_type:"custom_emoji",needs_repainting:false
      });
      set=await tg("getStickerSet",{name:setName});
    }
    const stickers=Array.isArray(set?.stickers)?set.stickers:[];
    if(stickers.length<BOT_UI_ICON_KEYS.length)throw new Error("Custom icon set is incomplete");
    const icons:Partial<Record<BotUiIconKey,string>>={};
    BOT_UI_ICON_KEYS.forEach((key,i)=>{
      const id=String(stickers[i]?.custom_emoji_id||"");
      if(id)icons[key]=id;
    });
    if(Object.keys(icons).length!==BOT_UI_ICON_KEYS.length)throw new Error("Custom emoji identifiers are unavailable");
    const value={version:BOT_UI_ICON_VERSION,status:"ready",set_name:setName,icons,updated_at:new Date().toISOString()};
    await writeBotUiState(value);
    await systemLog("info","VAYZEN bot UI custom icons ready",{set_name:setName,count:Object.keys(icons).length});
    return value;
  }catch(err){
    const message=err instanceof Error?err.message:String(err);
    const value={version:BOT_UI_ICON_VERSION,status:"unsupported",error:message.slice(0,300),retry_after:new Date(Date.now()+24*60*60_000).toISOString(),updated_at:new Date().toISOString()};
    await writeBotUiState(value);
    await systemLog("warning","VAYZEN bot UI icons unavailable",{error:message.slice(0,250)});
    return value;
  }
}
async function botUiStatus(){
  const {data}=await db.from("app_settings").select("value").eq("key","bot_ui_icons").maybeSingle();
  const v:any=data?.value||{};
  return {status:String(v.status||"not_configured"),count:v.icons?Object.keys(v.icons).length:0,error:String(v.error||""),set_name:String(v.set_name||"")};
}

async function channel(key:string){
  const {data,error}=await db.from("telegram_channels")
    .select("telegram_channel_id,title,is_active")
    .eq("channel_key",key).maybeSingle();
  if(error) throw error;
  if(!data?.is_active||!data.telegram_channel_id) throw new Error(`Channel not configured: ${key}`);
  return data;
}

async function send(chatId:string|number,text:string,reply_markup?:unknown){
  return tgWithMarkup("sendMessage",{chat_id:chatId,text},reply_markup);
}


async function sendRemotePhotoTo(key:string,url:string,caption:string){
  const ch=await channel(key);
  const m=await tg("sendPhoto",{chat_id:ch.telegram_channel_id,photo:url,caption:caption.slice(0,1000)});
  const file=photoFrom(m);
  if(!file)throw new Error("تعذر حفظ صورة TMDb في Telegram.");
  return {file,place:{channel_id:Number(ch.telegram_channel_id),message_id:Number(m.message_id)}};
}
async function sendTmdbPreview(chatId:number,type:"movie"|"series",mapped:any,bundle:any){
  const ar=bundle?.ar||{};
  const posterUrl=await tmdbImageUrl(mapped.poster_path,"poster");
  const year=mapped.release_year||"—";
  const rating=mapped.rating?Number(mapped.rating).toFixed(1):"—";
  const extra=type==="series"
    ? `المواسم: ${Number(ar.number_of_seasons||0)||"—"}\nالحلقات: ${Number(ar.number_of_episodes||0)||"—"}`
    : `المدة: ${mapped.duration_minutes?mapped.duration_minutes+" دقيقة":"—"}`;
  const caption=[
    type==="movie"?"نتيجة TMDb • فيلم":"نتيجة TMDb • مسلسل",
    "",
    mapped.title,
    mapped.original_title&&mapped.original_title!==mapped.title?mapped.original_title:"",
    `السنة: ${year}`,
    `التقييم: ${rating}/10`,
    `التصنيف: ${(mapped.genres||[]).join(" • ")||"—"}`,
    extra,
    "",
    String(mapped.description||"").slice(0,420),
    "",
    `TMDb ID: ${mapped.external_id}`
  ].filter(Boolean).join("\n").slice(0,980);
  const reply_markup={inline_keyboard:[
    [{text:"استخدام هذه النتيجة",callback_data:`tmdb_use|${type==="movie"?"m":"s"}|${mapped.external_id}`}],
    [{text:"بحث جديد",callback_data:`tmdb_again|${type==="movie"?"m":"s"}`},{text:"إلغاء",callback_data:"cancel"}]
  ]};
  if(posterUrl){
    const m=await tgWithMarkup("sendPhoto",{chat_id:chatId,photo:posterUrl,caption},reply_markup);
    return {message:m,poster:photoFrom(m),poster_source_message_id:Number(m.message_id)};
  }
  const m=await tgWithMarkup("sendMessage",{chat_id:chatId,text:caption},reply_markup);
  return {message:m,poster:null,poster_source_message_id:null};
}

type AdminPermission="content"|"publish"|"delete_content"|"requests"|"reports"|"users"|"stats"|"logs"|"system"|"admins";
type Admin={telegram_user_id:number;display_name?:string;role:string;permissions:Record<string,boolean>;is_active:boolean};

const permissionLabels:Record<AdminPermission,string>={
  content:"إدارة المحتوى",publish:"النشر",delete_content:"حذف المحتوى",requests:"الطلبات",reports:"البلاغات",
  users:"المستخدمون",stats:"الإحصائيات",logs:"السجلات",system:"حالة النظام",admins:"إدارة المشرفين"
};

async function getAdmin(id:string|number):Promise<Admin|null>{
  const {data}=await db.from("admin_users")
    .select("telegram_user_id,display_name,role,permissions,is_active")
    .eq("telegram_user_id",Number(id)).maybeSingle();
  return data?.is_active ? data as Admin : null;
}

function defaultPermission(role:string,perm:AdminPermission){
  if(role==="owner")return true;
  if(role==="secondary_admin")return true;
  if(role==="content_manager")return ["content","publish","stats"].includes(perm);
  if(role==="requests_manager")return ["requests","reports","stats"].includes(perm);
  if(role==="user_manager")return ["users","stats"].includes(perm);
  if(role==="viewer")return ["stats","logs","system"].includes(perm);
  if(role==="moderator")return ["requests","reports","stats"].includes(perm);
  if(role==="support")return ["requests","reports"].includes(perm);
  return false;
}
function can(admin:Admin,perm:AdminPermission){
  if(admin.role==="owner")return true;
  if(admin.role==="secondary_admin")return true;
  if(perm==="admins")return false;
  const custom=admin.permissions?.[perm];
  return typeof custom==="boolean"?custom:defaultPermission(admin.role,perm);
}
function canManageAdmin(actor:Admin,target:Admin|null,newRole?:string){
  if(actor.role==="owner"){
    if(target?.role==="owner")return false;
    return true;
  }
  if(actor.role!=="secondary_admin")return false;
  if(target&&["owner","secondary_admin"].includes(target.role))return false;
  if(newRole&&["owner","secondary_admin"].includes(newRole))return false;
  return true;
}

function roleLabel(role:string){
  const map:Record<string,string>={owner:"المالك",secondary_admin:"أدمن ثانوي",content_manager:"مشرف محتوى",requests_manager:"مشرف طلبات",user_manager:"مشرف مستخدمين",viewer:"مراقب",moderator:"مشرف",support:"دعم"};
  return map[role]||role;
}

function menuFor(admin:Admin){
  const rows:any[]=[];
  if(can(admin,"content")&&can(admin,"publish")){
    rows.push([{text:"إضافة فيلم",callback_data:"add_movie"},{text:"إضافة مسلسل",callback_data:"add_series"}]);
    rows.push([{text:"إضافة حلقات جماعية",callback_data:"batch_episode"},{text:"إضافة حلقة",callback_data:"add_episode"}]);
  }
  if(can(admin,"content")||admin.role==="owner"){
    const row:any[]=[];
    if(can(admin,"content"))row.push({text:"إدارة المحتوى",callback_data:"content"});
    if(admin.role==="owner")row.push({text:"TMDb",callback_data:"tmdb_settings"});
    if(row.length)rows.push(row);
  }
  if(can(admin,"requests")||can(admin,"reports")){
    const row:any[]=[];
    if(can(admin,"requests"))row.push({text:"طلبات المستخدمين",callback_data:"requests"});
    if(can(admin,"reports"))row.push({text:"البلاغات",callback_data:"reports"});
    if(row.length)rows.push(row);
  }
  if(can(admin,"users")||can(admin,"admins")){
    const row:any[]=[];
    if(can(admin,"users"))row.push({text:"المستخدمون",callback_data:"users"});
    if(can(admin,"admins"))row.push({text:"المشرفون",callback_data:"admins"});
    if(row.length)rows.push(row);
  }
  if(can(admin,"stats")||can(admin,"system")){
    const row:any[]=[];
    if(can(admin,"stats"))row.push({text:"الإحصائيات",callback_data:"stats"});
    if(can(admin,"system"))row.push({text:"حالة النظام",callback_data:"system_status"});
    if(row.length)rows.push(row);
  }
  if(can(admin,"logs"))rows.push([{text:"سجل الإدارة",callback_data:"admin_logs"}]);
  if(admin.role==="owner")rows.push([{text:"هوية أزرار VAYZEN",callback_data:"bot_ui_settings"}]);
  rows.push([{text:"إلغاء العملية",callback_data:"cancel"}]);
  return {inline_keyboard:rows};
}

async function showMenu(chatId:string|number,text="لوحة إدارة VAYZEN",admin?:Admin|null){
  const a=admin??await getAdmin(chatId);
  if(!a)return send(chatId,"غير مصرح لك باستخدام لوحة الإدارة.");
  if(a.role==="owner")await ensureBotUiIcons(Number(a.telegram_user_id));
  return send(chatId,`${text}\n\n${roleLabel(a.role)} • ${a.display_name||a.telegram_user_id}`,menuFor(a));
}

async function getSession(userId:number){
  const {data}=await db.from("bot_sessions").select("flow,step,draft")
    .eq("telegram_user_id",userId).maybeSingle();
  return data??null;
}
async function setSession(userId:number,flow:string,step:string,draft:Record<string,unknown>={}){
  const {error}=await db.from("bot_sessions").upsert({
    telegram_user_id:userId,flow,step,draft,updated_at:new Date().toISOString(),
  });
  if(error) throw error;
}
async function clearSession(userId:number){
  await db.from("bot_sessions").delete().eq("telegram_user_id",userId);
}

function photoFrom(m:any){
  const photos=Array.isArray(m.photo)?m.photo:[];
  if(photos.length){
    const p=photos[photos.length-1];
    return {file_id:p.file_id,file_unique_id:p.file_unique_id??null,mime_type:"image/jpeg",file_name:null,file_size:p.file_size??null};
  }
  const d=m.document;
  if(d?.file_id&&String(d.mime_type||"").startsWith("image/")){
    return {file_id:d.file_id,file_unique_id:d.file_unique_id??null,mime_type:d.mime_type,file_name:d.file_name??null,file_size:d.file_size??null};
  }
  return null;
}
function videoFrom(m:any){
  const v=m.video;
  if(v?.file_id) return {file_id:v.file_id,file_unique_id:v.file_unique_id??null,mime_type:v.mime_type??"video/mp4",file_name:v.file_name??null,file_size:v.file_size??null};
  const d=m.document;
  if(d?.file_id&&String(d.mime_type||"").startsWith("video/")){
    return {file_id:d.file_id,file_unique_id:d.file_unique_id??null,mime_type:d.mime_type,file_name:d.file_name??null,file_size:d.file_size??null};
  }
  return null;
}
function yearOf(v:string){
  const n=Number(v.trim());
  return Number.isInteger(n)&&n>=1888&&n<=2100?n:null;
}
function positiveOrNull(v:string){
  if(v.trim()==="-") return null;
  const n=Number(v.trim());
  return Number.isInteger(n)&&n>0?n:null;
}
function splitGenres(v:string){
  return v.split(/[,،/]/).map(x=>x.trim()).filter(Boolean).slice(0,12);
}
function sizeLabel(v:any){
  const n=Number(v||0);
  if(!n) return "غير معروف";
  return n>=1024**3?`${(n/1024**3).toFixed(2)} GB`:`${(n/1024**2).toFixed(1)} MB`;
}

async function copyTo(key:string,fromChatId:number,messageId:number,caption:string){
  const ch=await channel(key);
  const r=await tg("copyMessage",{
    chat_id:ch.telegram_channel_id,
    from_chat_id:fromChatId,
    message_id:messageId,
    caption,
  });
  return {channel_id:Number(ch.telegram_channel_id),message_id:Number(r.message_id)};
}

function normalizeVariant(value:any){
  const v=String(value||"default").trim().toLowerCase().replace(/\s+/g,"");
  return /^[a-z0-9_-]{1,20}$/.test(v)?v:"default";
}
function variantLabel(value:string){
  const v=normalizeVariant(value);
  if(v==="default")return "افتراضي";
  if(/^\d{3,4}p$/.test(v))return v;
  if(v==="4k")return "4K";
  return v.toUpperCase();
}
async function saveAsset(entity_type:string,entity_id:string,kind:string,file:any,place:any,variant="default"){
  variant=normalizeVariant(variant);
  const {error}=await db.from("media_assets").upsert({
    entity_type,entity_id,kind,variant,
    channel_id:place.channel_id,
    channel_message_id:place.message_id,
    telegram_file_id:file.file_id??null,
    telegram_unique_id:file.file_unique_id??null,
    mime_type:file.mime_type??null,
    file_name:file.file_name??null,
    file_size:file.file_size??null,
  },{onConflict:"entity_type,entity_id,kind,variant"});
  if(error) throw error;
}

async function deleteCopiedMessage(place:any){
  if(!place?.channel_id||!place?.message_id)return;
  try{await tg("deleteMessage",{chat_id:place.channel_id,message_id:place.message_id});}catch{}
}

async function cleanupEntity(entityType:"movie"|"series"|"episode",entityId:string,places:any[]=[]){
  for(const place of places) await deleteCopiedMessage(place);
  try{await db.from("media_assets").delete().eq("entity_type",entityType).eq("entity_id",entityId);}catch{}
  if(entityType==="movie")try{await db.from("movies").delete().eq("id",entityId);}catch{}
  if(entityType==="series")try{await db.from("series").delete().eq("id",entityId);}catch{}
  if(entityType==="episode")try{await db.from("episodes").delete().eq("id",entityId);}catch{}
}

async function adminLog(adminId:number,action:string,entity_type?:string,entity_id?:string,public_id?:string,details:any={}){
  await db.from("admin_logs").insert({
    admin_telegram_id:adminId,action,
    entity_type:entity_type??null,entity_id:entity_id??null,entity_public_id:public_id??null,details,
  });
  try{
    const ch=await channel("admin_logs");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:
      `VAYZEN ADMIN LOG\nAction: ${action}\nAdmin: ${adminId}\nID: ${public_id||"—"}\nType: ${entity_type||"—"}`
    });
  }catch{}
}

async function systemLog(level:string,message:string,details:any={}){
  try{await db.from("system_logs").insert({level,source:"edge",message,details});}catch{}
  try{
    const ch=await channel("system_logs");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:`VAYZEN SYSTEM ${level.toUpperCase()}\n${message}`});
  }catch{}
}

function movieSummary(d:any){
  const videos=Array.isArray(d.videos)&&d.videos.length?d.videos:(d.video?[{variant:normalizeVariant(d.quality||"default"),file:d.video}]:[]);
  const qualities=videos.map((x:any)=>`${variantLabel(x.variant||"default")} (${sizeLabel(x.file?.file_size)})`).join(" • ")||"—";
  return [
    "معاينة الفيلم:",
    `الاسم: ${d.title}`,
    `الاسم الأصلي: ${d.original_title||"—"}`,
    `السنة: ${d.release_year||"—"}`,
    `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
    `اللغة: ${d.language||"—"}`,
    `الدولة: ${d.country||"—"}`,
    `المدة: ${d.duration_minutes?d.duration_minutes+" دقيقة":"—"}`,
    `الجودات: ${qualities}`,
  ].join("\n");
}
function seriesSummary(d:any){
  return [
    "معاينة المسلسل:",
    `الاسم: ${d.title}`,
    `الاسم الأصلي: ${d.original_title||"—"}`,
    `السنة: ${d.release_year||"—"}`,
    `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
    `اللغة: ${d.language||"—"}`,
    `الدولة: ${d.country||"—"}`,
    `الجودة: ${d.quality||"—"}`,
  ].join("\n");
}

async function publishMovie(userId:number,chatId:number,d:any){
  const videos:any[]=Array.isArray(d.videos)&&d.videos.length?d.videos:(d.video?[{variant:normalizeVariant(d.quality||"default"),file:d.video,source_message_id:d.video_source_message_id}]:[]);
  if(!videos.length)throw new Error("Movie video missing");
  const unique=new Set<string>();
  for(const v of videos){const q=normalizeVariant(v.variant||"default");if(unique.has(q))throw new Error(`جودة مكررة: ${variantLabel(q)}`);unique.add(q);v.variant=q;}
  const best=[...videos].sort((a,b)=>qualityRank(b.variant)-qualityRank(a.variant))[0];
  const bestLabel=variantLabel(best.variant);
  const {data:movie,error}=await db.from("movies").insert({
    title:d.title,original_title:d.original_title||"",description:d.description||"",
    release_year:d.release_year,genres:d.genres||[],language:d.language||"",country:d.country||"",
    duration_minutes:d.duration_minutes,quality:bestLabel,status:"draft",
    external_source:d.external_source||null,external_id:d.external_id||null,external_metadata:d.external_metadata||{},
    release_date:d.release_date||null,rating:d.rating||null,rating_count:d.rating_count||null,created_by:userId,
  }).select("id,public_id").single();
  if(error||!movie) throw error??new Error("Movie insert failed");

  let posterPlace:any=null,backdropPlace:any=null;const videoPlaces:any[]=[];
  try{
    const infoCaption=[
      `${movie.public_id}`,"",`🎬 ${d.title}`,
      d.original_title&&d.original_title!==d.title?d.original_title:"",
      "",`السنة: ${d.release_year||"—"}`,
      `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
      `اللغة: ${d.language||"—"}`,`الدولة: ${d.country||"—"}`,
      `المدة: ${d.duration_minutes?d.duration_minutes+" دقيقة":"—"}`,
      `الجودات: ${videos.map(v=>variantLabel(v.variant)).join(" • ")}`,"",d.description||"","",`Movie ID: ${movie.public_id}`,
    ].filter(Boolean).join("\n");
    posterPlace=await copyTo("movies_info",chatId,d.poster_source_message_id,infoCaption);
    await saveAsset("movie",movie.id,"poster",d.poster,posterPlace);
    if(d.backdrop_url){
      const remote=await sendRemotePhotoTo("movies_info",d.backdrop_url,`${movie.public_id} | ${d.title} | backdrop`);
      backdropPlace=remote.place;
      await saveAsset("movie",movie.id,"backdrop",remote.file,remote.place);
    }
    for(const v of videos){
      const place=await copyTo("movies_storage",chatId,v.source_message_id,`${movie.public_id} | ${d.title} | ${variantLabel(v.variant)} | ${sizeLabel(v.file?.file_size)}`);
      videoPlaces.push(place);
      await saveAsset("movie",movie.id,"video",v.file,place,v.variant);
    }
    const {error:publishError}=await db.from("movies").update({status:"published",quality:bestLabel,updated_at:new Date().toISOString()}).eq("id",movie.id);
    if(publishError)throw publishError;
    await adminLog(userId,"movie_publish","movie",movie.id,movie.public_id,{title:d.title,qualities:videos.map(v=>v.variant)});
    return movie.public_id;
  }catch(err){
    await cleanupEntity("movie",movie.id,[...videoPlaces,backdropPlace,posterPlace]);
    await systemLog("error","movie publish rolled back",{public_id:movie.public_id});
    throw err;
  }
}

async function publishSeries(userId:number,chatId:number,d:any){
  const {data:series,error}=await db.from("series").insert({
    title:d.title,original_title:d.original_title||"",description:d.description||"",
    release_year:d.release_year,genres:d.genres||[],language:d.language||"",country:d.country||"",
    quality:d.quality||"",status:"draft",
    external_source:d.external_source||null,external_id:d.external_id||null,external_metadata:d.external_metadata||{},
    first_air_date:d.first_air_date||null,rating:d.rating||null,rating_count:d.rating_count||null,created_by:userId,
  }).select("id,public_id").single();
  if(error||!series) throw error??new Error("Series insert failed");

  let posterPlace:any=null,backdropPlace:any=null;
  try{
    const infoCaption=[
      `${series.public_id}`,"",`📺 ${d.title}`,
      d.original_title&&d.original_title!==d.title?d.original_title:"",
      "",`السنة: ${d.release_year||"—"}`,
      `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
      `اللغة: ${d.language||"—"}`,`الدولة: ${d.country||"—"}`,
      `الجودة: ${d.quality||"—"}`,"",d.description||"","",`Series ID: ${series.public_id}`,
    ].filter(Boolean).join("\n");
    posterPlace=await copyTo("series_info",chatId,d.poster_source_message_id,infoCaption);
    await saveAsset("series",series.id,"poster",d.poster,posterPlace);
    if(d.backdrop_url){
      const remote=await sendRemotePhotoTo("series_info",d.backdrop_url,`${series.public_id} | ${d.title} | backdrop`);
      backdropPlace=remote.place;
      await saveAsset("series",series.id,"backdrop",remote.file,remote.place);
    }
    const {error:publishError}=await db.from("series").update({status:"published",updated_at:new Date().toISOString()}).eq("id",series.id);
    if(publishError)throw publishError;
    await adminLog(userId,"series_publish","series",series.id,series.public_id,{title:d.title});
    return series.public_id;
  }catch(err){
    await cleanupEntity("series",series.id,[backdropPlace,posterPlace]);
    await systemLog("error","series publish rolled back",{public_id:series.public_id});
    throw err;
  }
}

async function publishEpisode(userId:number,chatId:number,d:any){
  const {data:series}=await db.from("series").select("id,title,public_id,status")
    .eq("public_id",String(d.series_public_id).toUpperCase()).maybeSingle();
  if(!series||series.status!=="published") throw new Error("Series not found");

  let {data:season}=await db.from("seasons").select("id,status").eq("series_id",series.id).eq("season_number",d.season_number).maybeSingle();
  if(!season){
    const {data:createdSeason,error:se}=await db.from("seasons").insert({
      series_id:series.id,season_number:d.season_number,title:`الموسم ${d.season_number}`,status:"published",
    }).select("id").single();
    if(se||!createdSeason)throw se??new Error("Season failed");
    season={...createdSeason,status:"published"};
  }
  const seasonWasDraft=season.status==="draft";

  const {data:existing}=await db.from("episodes").select("id,public_id,status,title,description,duration_minutes,external_source")
    .eq("season_id",season.id).eq("episode_number",d.episode_number).maybeSingle();

  let ep:any=existing,created=false;
  if(existing){
    const genericTitle=!d.title||String(d.title).trim()===`الحلقة ${d.episode_number}`;
    const {data:updated,error}=await db.from("episodes").update({
      title:genericTitle&&existing.title?existing.title:(d.title||existing.title||`الحلقة ${d.episode_number}`),
      description:d.description||existing.description||"",
      duration_minutes:d.duration_minutes??existing.duration_minutes??null,
      quality:d.quality||"",
      updated_at:new Date().toISOString(),
    }).eq("id",existing.id).select("id,public_id,status").single();
    if(error||!updated)throw error??new Error("Episode update failed");
    ep=updated;
  }else{
    const {data:inserted,error}=await db.from("episodes").insert({
      season_id:season.id,episode_number:d.episode_number,title:d.title||`الحلقة ${d.episode_number}`,
      description:d.description||"",quality:d.quality||"",status:"draft",created_by:userId,
    }).select("id,public_id,status").single();
    if(error||!inserted) throw error??new Error("Episode failed");
    ep=inserted;created=true;
  }

  let place:any=null;
  const variant=normalizeVariant(d.variant||d.quality||"default");
  const oldAsset:any=await currentAsset("episode",ep.id,"video",variant);
  let assetWritten=false,seasonPromoted=false;
  try{
    place=await copyTo("series_storage",chatId,d.video_source_message_id,
      `${ep.public_id} | ${series.title} | موسم ${d.season_number} | حلقة ${d.episode_number} | ${variantLabel(variant)}`);
    await saveAsset("episode",ep.id,"video",d.video,place,variant);
    assetWritten=true;
    const {error:publishError}=await db.from("episodes").update({status:"published",quality:d.quality||variantLabel(variant),updated_at:new Date().toISOString()}).eq("id",ep.id);
    if(publishError)throw publishError;
    if(seasonWasDraft){
      const {error:seasonError}=await db.from("seasons").update({status:"published",updated_at:new Date().toISOString()}).eq("id",season.id);
      if(seasonError)throw seasonError;
      seasonPromoted=true;
    }
    if(oldAsset?.channel_id&&oldAsset?.channel_message_id)await deleteCopiedMessage({channel_id:oldAsset.channel_id,message_id:oldAsset.channel_message_id});
    await adminLog(userId,existing?"episode_replace":"episode_publish","episode",ep.id,ep.public_id,{series:series.title});
    return ep.public_id;
  }catch(err){
    await deleteCopiedMessage(place);
    if(assetWritten){
      if(oldAsset){
        await db.from("media_assets").update({
          channel_id:oldAsset.channel_id,channel_message_id:oldAsset.channel_message_id,
          telegram_file_id:oldAsset.telegram_file_id??null,telegram_unique_id:oldAsset.telegram_unique_id??null,
          mime_type:oldAsset.mime_type??null,file_name:oldAsset.file_name??null,file_size:oldAsset.file_size??null,
          updated_at:new Date().toISOString()
        }).eq("entity_type","episode").eq("entity_id",ep.id).eq("kind","video").eq("variant",variant);
      }else{
        await db.from("media_assets").delete().eq("entity_type","episode").eq("entity_id",ep.id).eq("kind","video").eq("variant",variant);
      }
    }
    if(created)await cleanupEntity("episode",ep.id);
    else await db.from("episodes").update({status:existing.status,updated_at:new Date().toISOString()}).eq("id",ep.id);
    if(seasonWasDraft&&seasonPromoted)await db.from("seasons").update({status:"draft",updated_at:new Date().toISOString()}).eq("id",season.id);
    await systemLog("error","episode publish failed",{public_id:ep.public_id});
    throw err;
  }
}

function adminErrorText(err:any){
  const raw=err instanceof Error?err.message:String(err||"خطأ غير معروف");
  if(raw.includes("chat not found"))return "تعذر الوصول إلى قناة التخزين. تحقق أن البوت مشرف في القناة.";
  if(raw.includes("file exceeds"))return "حجم الملف أكبر من الحد المسموح.";
  if(raw.includes("Series not found"))return "المسلسل غير موجود أو غير منشور.";
  return raw.slice(0,180);
}

async function contentByPublicId(type:string,publicId:string){
  const table=type==="movie"?"movies":type==="series"?"series":null;
  if(!table)return null;
  const fields=type==="movie"
    ?"id,public_id,title,original_title,description,release_year,genres,language,country,duration_minutes,quality,status,is_featured,view_count,external_source,external_id,rating,rating_count,release_date,created_at,updated_at"
    :"id,public_id,title,original_title,description,release_year,genres,language,country,quality,status,is_featured,view_count,external_source,external_id,rating,rating_count,first_air_date,created_at,updated_at";
  const {data}=await db.from(table).select(fields).eq("public_id",publicId.toUpperCase()).maybeSingle();
  return data??null;
}

async function episodeByPublicId(publicId:string){
  const {data:ep}=await db.from("episodes")
    .select("id,public_id,season_id,episode_number,title,description,duration_minutes,quality,status,view_count,created_at,updated_at")
    .eq("public_id",publicId.toUpperCase()).maybeSingle();
  if(!ep)return null;
  const {data:season}=await db.from("seasons").select("id,series_id,season_number,title,status").eq("id",ep.season_id).maybeSingle();
  const {data:series}=season?await db.from("series").select("id,public_id,title,status").eq("id",season.series_id).maybeSingle():{data:null};
  return {...ep,season,series};
}

async function currentAsset(entityType:string,entityId:string,kind:string,variant="default"){
  const {data}=await db.from("media_assets")
    .select("channel_id,channel_message_id,telegram_file_id,telegram_unique_id,file_size,mime_type,file_name,variant")
    .eq("entity_type",entityType).eq("entity_id",entityId).eq("kind",kind).eq("variant",normalizeVariant(variant)).maybeSingle();
  return data??null;
}

async function replaceStoredAsset(opts:{
  adminId:number;chatId:number;entityType:"movie"|"series"|"episode";entityId:string;publicId:string;
  kind:"poster"|"video";channelKey:string;sourceMessageId:number;file:any;caption:string;variant?:string;
}){
  const variant=normalizeVariant(opts.variant||"default");
  const oldAsset:any=await currentAsset(opts.entityType,opts.entityId,opts.kind,variant);
  const place=await copyTo(opts.channelKey,opts.chatId,opts.sourceMessageId,opts.caption);
  try{
    await saveAsset(opts.entityType,opts.entityId,opts.kind,opts.file,place,variant);
  }catch(err){
    await deleteCopiedMessage(place);
    throw err;
  }
  if(oldAsset?.channel_id&&oldAsset?.channel_message_id){
    await deleteCopiedMessage({channel_id:oldAsset.channel_id,message_id:oldAsset.channel_message_id});
  }
  await adminLog(opts.adminId,"asset_replace",opts.entityType,opts.entityId,opts.publicId,{kind:opts.kind,variant});
}

async function sendContentEditMenu(chatId:number,type:string,publicId:string){
  const item:any=await contentByPublicId(type,publicId);
  if(!item)return sendContentManager(chatId);
  const rows:any[]=[
    [{text:"الاسم",callback_data:`cef|${type}|${item.public_id}|title`},{text:"الوصف",callback_data:`cef|${type}|${item.public_id}|description`}],
    [{text:"السنة",callback_data:`cef|${type}|${item.public_id}|release_year`},{text:"التصنيفات",callback_data:`cef|${type}|${item.public_id}|genres`}],
    [{text:"اللغة",callback_data:`cef|${type}|${item.public_id}|language`},{text:"الدولة",callback_data:`cef|${type}|${item.public_id}|country`}],
    [{text:"الجودة",callback_data:`cef|${type}|${item.public_id}|quality`}],
  ];
  if(type==="movie")rows.push([{text:"المدة",callback_data:`cef|${type}|${item.public_id}|duration_minutes`}]);
  rows.push([{text:"رجوع",callback_data:`cm|${type}|${item.public_id}`}]);
  return send(chatId,`تعديل ${item.public_id}\nاختر الحقل المطلوب:`,{inline_keyboard:rows});
}

async function sendSeriesEpisodes(chatId:number,seriesPublicId:string){
  const series:any=await contentByPublicId("series",seriesPublicId);
  if(!series)return sendContentList(chatId,"series");
  const {data:seasons,error}=await db.from("seasons").select("id,season_number,title,status").eq("series_id",series.id).order("season_number",{ascending:true});
  if(error)throw error;
  const rows:any[]=[];
  let total=0;
  for(const season of seasons??[]){
    const {count}=await db.from("episodes").select("id",{head:true,count:"exact"}).eq("season_id",season.id);
    total+=count||0;
    rows.push([{text:`${season.status==="published"?"●":"○"} الموسم ${season.season_number} • ${count||0} حلقة`,callback_data:`season|${series.public_id}|${season.season_number}`}]);
  }
  rows.push([{text:"إضافة حلقة",callback_data:`add_episode_for|${series.public_id}`}]);
  rows.push([{text:"رجوع للمسلسل",callback_data:`cm|series|${series.public_id}`}]);
  return send(chatId,`${series.title}\n\nالمواسم: ${(seasons??[]).length}\nالحلقات: ${total}\n\nاختر موسمًا:`,{inline_keyboard:rows});
}

async function sendSeasonEpisodes(chatId:number,seriesPublicId:string,seasonNumber:number){
  const series:any=await contentByPublicId("series",seriesPublicId);
  if(!series)return sendContentList(chatId,"series");
  const {data:season}=await db.from("seasons").select("id,season_number,title,status").eq("series_id",series.id).eq("season_number",seasonNumber).maybeSingle();
  if(!season)return sendSeriesEpisodes(chatId,seriesPublicId);
  const {data:eps,error}=await db.from("episodes").select("public_id,episode_number,title,status,quality,view_count").eq("season_id",season.id).order("episode_number",{ascending:true});
  if(error)throw error;
  const rows:any[]=(eps??[]).map((ep:any)=>[{text:`${ep.status==="published"?"●":"○"} الحلقة ${ep.episode_number} • ${String(ep.title||"").slice(0,22)}`,callback_data:`epi|${ep.public_id}`}]);
  const nextStatus=season.status==="published"?"hidden":"published";
  rows.push([{text:"إضافة حلقة",callback_data:`ae_season|${series.public_id}|${seasonNumber}`}]);
  rows.push([{text:nextStatus==="published"?"نشر الموسم":"إخفاء الموسم",callback_data:`ss|${series.public_id}|${seasonNumber}|${nextStatus}`},{text:"تعديل اسم الموسم",callback_data:`sedit|${series.public_id}|${seasonNumber}`}]);
  rows.push([{text:"حذف الموسم",callback_data:`sd1|${series.public_id}|${seasonNumber}`}]);
  rows.push([{text:"رجوع للمواسم",callback_data:`se|${series.public_id}`}]);
  return send(chatId,`${series.title}\n${season.title||`الموسم ${seasonNumber}`}\n\nالحلقات: ${(eps??[]).length}\nالحالة: ${season.status}`,{inline_keyboard:rows});
}

async function deleteSeason(adminId:number,seriesPublicId:string,seasonNumber:number){
  const series:any=await contentByPublicId("series",seriesPublicId);
  if(!series)throw new Error("المسلسل غير موجود");
  const {data:season}=await db.from("seasons").select("id").eq("series_id",series.id).eq("season_number",seasonNumber).maybeSingle();
  if(!season)throw new Error("الموسم غير موجود");
  const {data:eps}=await db.from("episodes").select("id,public_id").eq("season_id",season.id);
  const ids=(eps??[]).map((x:any)=>x.id);
  if(ids.length){
    const {data:assets}=await db.from("media_assets").select("channel_id,channel_message_id").eq("entity_type","episode").in("entity_id",ids);
    for(const a of assets??[])await deleteCopiedMessage({channel_id:a.channel_id,message_id:a.channel_message_id});
    await db.from("media_assets").delete().eq("entity_type","episode").in("entity_id",ids);
    const {error:episodeDeleteError}=await db.from("episodes").delete().eq("season_id",season.id);
    if(episodeDeleteError)throw episodeDeleteError;
  }
  const {error}=await db.from("seasons").delete().eq("id",season.id);if(error)throw error;
  await adminLog(adminId,"season_delete","series",series.id,series.public_id,{season_number:seasonNumber});
}

async function sendEpisodeItem(chatId:number,publicId:string){
  const ep:any=await episodeByPublicId(publicId);
  if(!ep)return send(chatId,"الحلقة غير موجودة.",{inline_keyboard:[[{text:"رجوع",callback_data:"content"}]]});
  const nextStatus=ep.status==="published"?"hidden":"published";
  const rows:any[]=[
    [{text:nextStatus==="published"?"نشر الحلقة":"إخفاء الحلقة",callback_data:`eps|${ep.public_id}|${nextStatus}`}],
    [{text:"تعديل الاسم",callback_data:`epe|${ep.public_id}|title`},{text:"تعديل الوصف",callback_data:`epe|${ep.public_id}|description`}],
    [{text:"تعديل الجودة",callback_data:`epe|${ep.public_id}|quality`},{text:"إدارة الجودات",callback_data:`q|episode|${ep.public_id}`}],
    [{text:"حذف الحلقة",callback_data:`epd1|${ep.public_id}`}],
    [{text:"رجوع للحلقات",callback_data:`se|${ep.series?.public_id||""}`}],
  ];
  return send(chatId,
    `${ep.public_id}\n${ep.series?.title||"مسلسل"} • موسم ${ep.season?.season_number||"—"} • حلقة ${ep.episode_number}\n\nالعنوان: ${ep.title||"—"}\nالحالة: ${ep.status}\nالجودة: ${ep.quality||"—"}\nالمشاهدات: ${ep.view_count||0}`,
    {inline_keyboard:rows}
  );
}

async function qualityTarget(type:string,publicId:string){
  if(type==="movie"){
    const item:any=await contentByPublicId("movie",publicId);
    return item?{entityType:"movie",item,channelKey:"movies_storage"}:null;
  }
  if(type==="episode"){
    const item:any=await episodeByPublicId(publicId);
    return item?{entityType:"episode",item,channelKey:"series_storage"}:null;
  }
  return null;
}

async function sendQualityManager(chatId:number,type:string,publicId:string){
  const target:any=await qualityTarget(type,publicId);
  if(!target)return send(chatId,"المحتوى غير موجود.");
  const {data,error}=await db.from("media_assets").select("variant,file_size").eq("entity_type",target.entityType).eq("entity_id",target.item.id).eq("kind","video");
  if(error)throw error;
  const list=(data??[]).sort((a:any,b:any)=>qualityRank(String(b.variant))-qualityRank(String(a.variant)));
  const rows:any[]=list.map((x:any)=>[{text:`${variantLabel(String(x.variant))} • ${sizeLabel(x.file_size)}`,callback_data:`qv|${type}|${publicId}|${x.variant}`}]);
  rows.push([{text:"إضافة جودة",callback_data:`qa|${type}|${publicId}`}]);
  rows.push([{text:"رجوع",callback_data:type==="movie"?`cm|movie|${publicId}`:`epi|${publicId}`}]);
  return send(chatId,`${type==="movie"?"جودات الفيلم":"جودات الحلقة"}\n\n${list.length?`الموجود: ${list.length}`:"لا توجد ملفات فيديو."}`,{inline_keyboard:rows});
}

async function sendQualityItem(chatId:number,type:string,publicId:string,variant:string){
  const target:any=await qualityTarget(type,publicId);
  if(!target)return send(chatId,"المحتوى غير موجود.");
  const v=normalizeVariant(variant);
  const asset:any=await currentAsset(target.entityType,target.item.id,"video",v);
  if(!asset)return sendQualityManager(chatId,type,publicId);
  return send(chatId,`${variantLabel(v)}\nالحجم: ${sizeLabel(asset.file_size)}`,{inline_keyboard:[
    [{text:"استبدال الفيديو",callback_data:`qr|${type}|${publicId}|${v}`}],
    [{text:"حذف الجودة",callback_data:`qd1|${type}|${publicId}|${v}`}],
    [{text:"رجوع للجودات",callback_data:`q|${type}|${publicId}`}],
  ]});
}

async function deleteQuality(adminId:number,type:string,publicId:string,variant:string){
  const target:any=await qualityTarget(type,publicId);
  if(!target)throw new Error("المحتوى غير موجود");
  const {data:list}=await db.from("media_assets").select("variant").eq("entity_type",target.entityType).eq("entity_id",target.item.id).eq("kind","video");
  if((list??[]).length<=1)throw new Error("لا يمكن حذف آخر جودة؛ استبدل الفيديو بدلًا من ذلك.");
  const v=normalizeVariant(variant);
  const old:any=await currentAsset(target.entityType,target.item.id,"video",v);
  if(old)await deleteCopiedMessage({channel_id:old.channel_id,message_id:old.channel_message_id});
  const {error}=await db.from("media_assets").delete().eq("entity_type",target.entityType).eq("entity_id",target.item.id).eq("kind","video").eq("variant",v);
  if(error)throw error;
  await adminLog(adminId,"quality_delete",target.entityType,target.item.id,publicId,{variant:v});
}

async function sendAdminsManager(chatId:number,actor:Admin){
  const {data,error}=await db.from("admin_users").select("telegram_user_id,display_name,role,is_active,created_at").order("created_at",{ascending:true});
  if(error)throw error;
  const rows:any[]=(data??[]).map((x:any)=>[{
    text:`${x.is_active?"●":"○"} ${x.display_name||x.telegram_user_id} • ${roleLabel(x.role)}`,
    callback_data:`adm|${x.telegram_user_id}`
  }]);
  rows.push([{text:"إضافة مشرف",callback_data:"adm_add"}]);
  rows.push([{text:"رجوع",callback_data:"menu"}]);
  return send(chatId,`إدارة المشرفين\n\nالعدد: ${(data??[]).length}`,{inline_keyboard:rows});
}

async function sendAdminItem(chatId:number,actor:Admin,targetId:number){
  const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active,added_by,created_at").eq("telegram_user_id",targetId).maybeSingle();
  if(!t)return sendAdminsManager(chatId,actor);
  const target=t as Admin;
  const manageable=canManageAdmin(actor,target);
  const rows:any[]=[];
  if(manageable){
    rows.push([{text:"تغيير الدور",callback_data:`adm_roles|${targetId}`},{text:"تعديل الصلاحيات",callback_data:`adm_perms|${targetId}`}]);
    if(target.role!=="owner"&&target.telegram_user_id!==actor.telegram_user_id){
      rows.push([{text:target.is_active?"تعطيل المشرف":"إعادة التفعيل",callback_data:`adm_active|${targetId}|${target.is_active?"0":"1"}`}]);
      rows.push([{text:"حذف المشرف",callback_data:`adm_del1|${targetId}`}]);
    }
  }
  rows.push([{text:"رجوع",callback_data:"admins"}]);
  const perms=(Object.keys(permissionLabels) as AdminPermission[]).map(p=>`${can(target,p)?"✅":"—"} ${permissionLabels[p]}`).join("\n");
  return send(chatId,`${target.display_name||target.telegram_user_id}\nID: ${target.telegram_user_id}\nالدور: ${roleLabel(target.role)}\nالحالة: ${target.is_active?"نشط":"معطّل"}\n\nالصلاحيات الفعلية:\n${perms}`,{inline_keyboard:rows});
}

async function sendAdminRoles(chatId:number,actor:Admin,targetId:number){
  const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
  if(!t||!canManageAdmin(actor,t as Admin))return sendAdminsManager(chatId,actor);
  const roles=actor.role==="owner"
    ?["secondary_admin","content_manager","requests_manager","user_manager","viewer","moderator","support"]
    :["content_manager","requests_manager","user_manager","viewer","moderator","support"];
  const rows:any[]=roles.map(r=>[{text:`${t.role===r?"✓ ":""}${roleLabel(r)}`,callback_data:`adm_role|${targetId}|${r}`}]);
  rows.push([{text:"رجوع",callback_data:`adm|${targetId}`}]);
  return send(chatId,"اختر الدور الجديد:",{inline_keyboard:rows});
}

async function sendAdminPermissions(chatId:number,actor:Admin,targetId:number){
  const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
  if(!t||!canManageAdmin(actor,t as Admin))return sendAdminsManager(chatId,actor);
  if(["owner","secondary_admin"].includes(t.role))return send(chatId,"صلاحيات هذا الدور ثابتة ولا تعدّل يدويًا.",{inline_keyboard:[[{text:"رجوع",callback_data:`adm|${targetId}`}]]});
  const editable=(Object.keys(permissionLabels) as AdminPermission[]).filter(p=>p!=="admins");
  const rows:any[]=editable.map(p=>[{
    text:`${can(t as Admin,p)?"✅":"⬜"} ${permissionLabels[p]}`,
    callback_data:`admp|${targetId}|${p}|${can(t as Admin,p)?"0":"1"}`
  }]);
  rows.push([{text:"إعادة للوضع الافتراضي",callback_data:`admp_reset|${targetId}`}]);
  rows.push([{text:"رجوع",callback_data:`adm|${targetId}`}]);
  return send(chatId,`صلاحيات ${t.display_name||targetId}:`,{inline_keyboard:rows});
}

async function sendAdminLogs(chatId:number){
  const {data,error}=await db.from("admin_logs").select("admin_telegram_id,action,entity_type,entity_public_id,created_at,details").order("created_at",{ascending:false}).limit(15);
  if(error)throw error;
  const text=(data??[]).map((x:any)=>`• ${String(x.created_at).slice(0,16).replace("T"," ")} | ${x.admin_telegram_id} | ${x.action} | ${x.entity_public_id||x.entity_type||"—"}`).join("\n")||"لا يوجد نشاط إداري بعد.";
  return send(chatId,`آخر نشاطات الإدارة:\n\n${text}`,{inline_keyboard:[[{text:"تحديث",callback_data:"admin_logs"},{text:"رجوع",callback_data:"menu"}]]});
}

async function createAdmin(actor:Admin,telegramId:number,name:string,role:string){
  if(!Number.isInteger(telegramId)||telegramId<=0)throw new Error("Telegram ID غير صحيح");
  if(role==="owner")throw new Error("لا يمكن إنشاء Owner جديد");
  if(role==="secondary_admin"&&actor.role!=="owner")throw new Error("فقط المالك يستطيع إضافة أدمن ثانوي");
  const allowed=["secondary_admin","content_manager","requests_manager","user_manager","viewer","moderator","support"];
  if(!allowed.includes(role))throw new Error("الدور غير صالح");
  const {data:existing}=await db.from("admin_users").select("telegram_user_id,role").eq("telegram_user_id",telegramId).maybeSingle();
  if(existing)throw new Error("هذا الحساب موجود ضمن الإدارة بالفعل");
  const {error}=await db.from("admin_users").insert({telegram_user_id:telegramId,display_name:name.trim().slice(0,60)||String(telegramId),role,permissions:{},is_active:true,added_by:actor.telegram_user_id});
  if(error)throw error;
  await adminLog(actor.telegram_user_id,"admin_add","admin",undefined,String(telegramId),{role});
}

async function sendUsersManager(chatId:number){
  const {data,error}=await db.auth.admin.listUsers({page:1,perPage:8});
  if(error)throw error;
  const users=data?.users??[];
  const ids=users.map((u:any)=>u.id);
  const {data:profiles}=ids.length?await db.from("profiles").select("id,display_name,is_disabled,created_at").in("id",ids):{data:[] as any[]};
  const map=new Map((profiles??[]).map((p:any)=>[p.id,p]));
  const rows:any[]=users.map((u:any)=>{
    const p:any=map.get(u.id);
    const label=(p?.display_name||u.email||"مستخدم").slice(0,28);
    return [{text:`${p?.is_disabled?"⛔":"●"} ${label}`,callback_data:`usr|${u.id}`}];
  });
  rows.push([{text:"بحث عن مستخدم",callback_data:"user_search"}]);
  rows.push([{text:"رجوع للقائمة",callback_data:"menu"}]);
  return send(chatId,`المستخدمون\n\nآخر ${users.length} حسابات:`,{inline_keyboard:rows});
}

async function searchUsers(chatId:number,query:string){
  const q=query.trim().toLowerCase();
  if(q.length<2)return send(chatId,"أرسل حرفين على الأقل للبحث.");
  const found:any[]=[];
  for(let page=1;page<=5&&found.length<8;page++){
    const {data,error}=await db.auth.admin.listUsers({page,perPage:50});
    if(error)throw error;
    const users=data?.users??[];
    if(!users.length)break;
    const ids=users.map((u:any)=>u.id);
    const {data:profiles}=ids.length?await db.from("profiles").select("id,display_name,is_disabled").in("id",ids):{data:[] as any[]};
    const map=new Map((profiles??[]).map((p:any)=>[p.id,p]));
    for(const u of users){
      const p:any=map.get(u.id);
      const hay=(String(u.email||"")+" "+String(p?.display_name||"")).toLowerCase();
      if(hay.includes(q))found.push({u,p});
      if(found.length>=8)break;
    }
    if(users.length<50)break;
  }
  const rows:any[]=found.map(({u,p}:any)=>[{
    text:`${p?.is_disabled?"⛔":"●"} ${String(p?.display_name||u.email||"مستخدم").slice(0,28)}`,
    callback_data:`usr|${u.id}`
  }]);
  rows.push([{text:"بحث جديد",callback_data:"user_search"},{text:"رجوع",callback_data:"users"}]);
  return send(chatId,found.length?`نتائج البحث عن: ${query}`:"لا توجد نتائج مطابقة.",{inline_keyboard:rows});
}

async function sendUserItem(chatId:number,userId:string){
  const {data,error}=await db.auth.admin.getUserById(userId);
  if(error||!data?.user)return sendUsersManager(chatId);
  const u:any=data.user;
  const {data:p}=await db.from("profiles").select("display_name,is_disabled,created_at").eq("id",userId).maybeSingle();
  const disabled=Boolean(p?.is_disabled);
  return send(chatId,
    `${p?.display_name||"مستخدم VAYZEN"}\n${u.email||"—"}\n\nالتسجيل: ${String(p?.created_at||u.created_at||"—").slice(0,19)}\nالحالة: ${disabled?"معطّل":"نشط"}`,
    {inline_keyboard:[
      [{text:disabled?"إعادة تفعيل الحساب":"تعطيل الحساب",callback_data:`usb|${userId}|${disabled?"0":"1"}`}],
      [{text:"رجوع",callback_data:"users"}],
    ]}
  );
}

async function sendContentManager(chatId:number){
  const [m,s]=await Promise.all([
    db.from("movies").select("id",{head:true,count:"exact"}),
    db.from("series").select("id",{head:true,count:"exact"}),
  ]);
  return send(chatId,
    `إدارة المحتوى\n\nالأفلام: ${m.count||0}\nالمسلسلات: ${s.count||0}\n\nاختر القسم:`,
    {inline_keyboard:[
      [{text:`الأفلام (${m.count||0})`,callback_data:"content_movies"},{text:`المسلسلات (${s.count||0})`,callback_data:"content_series"}],
      [{text:"بحث في المحتوى",callback_data:"content_search"}],
      [{text:"رجوع للقائمة",callback_data:"menu"}],
    ]}
  );
}

async function sendContentList(chatId:number,type:"movie"|"series"){
  const table=type==="movie"?"movies":"series";
  const {data,error}=await db.from(table).select("public_id,title,status,is_featured,created_at").order("created_at",{ascending:false}).limit(20);
  if(error)throw error;
  const rows:any[]=(data??[]).map((x:any)=>[{
    text:`${x.status==="published"?"●":"○"} ${String(x.title).slice(0,30)}${x.is_featured?" ★":""}`,
    callback_data:`cm|${type}|${x.public_id}`
  }]);
  rows.push([{text:"بحث",callback_data:`content_search_type|${type}`},{text:"رجوع",callback_data:"content"}]);
  return send(chatId,type==="movie"?"الأفلام\n\nاختر فيلمًا لإدارته:":"المسلسلات\n\nاختر مسلسلًا لإدارته:",{inline_keyboard:rows});
}

async function searchContent(chatId:number,query:string,type?:string){
  const q=query.trim().replace(/[%_,()]/g," ").replace(/\s+/g," ").trim();
  if(q.length<2)return send(chatId,"أرسل حرفين على الأقل.");
  const types=type&&["movie","series"].includes(type)?[type]:["movie","series"];
  const rows:any[]=[];
  for(const t of types){
    const table=t==="movie"?"movies":"series";
    const {data}=await db.from(table).select("public_id,title,status,is_featured").or(`title.ilike.%${q}%,public_id.ilike.%${q}%`).limit(10);
    for(const x of data??[])rows.push([{text:`${t==="movie"?"فيلم":"مسلسل"} • ${String(x.title).slice(0,28)}`,callback_data:`cm|${t}|${x.public_id}`}]);
  }
  rows.push([{text:"بحث جديد",callback_data:type?`content_search_type|${type}`:"content_search"},{text:"رجوع",callback_data:type==="movie"?"content_movies":type==="series"?"content_series":"content"}]);
  return send(chatId,rows.length>1?`نتائج البحث عن: ${q}`:"لا توجد نتائج مطابقة.",{inline_keyboard:rows});
}

async function sendBatchSeriesPicker(chatId:number){
  const {data,error}=await db.from("series").select("public_id,title,status").eq("status","published").order("updated_at",{ascending:false}).limit(20);
  if(error)throw error;
  const rows:any[]=(data??[]).map((x:any)=>[{text:String(x.title).slice(0,34),callback_data:`batch_for|${x.public_id}`}]);
  rows.push([{text:"رجوع",callback_data:"menu"}]);
  return send(chatId,(data??[]).length?"إضافة حلقات جماعية\n\nاختر المسلسل:":"لا توجد مسلسلات منشورة بعد.",{inline_keyboard:rows});
}

async function sendBatchSeasonPicker(chatId:number,seriesPublicId:string){
  const series:any=await contentByPublicId("series",seriesPublicId);if(!series)return sendBatchSeriesPicker(chatId);
  const {data:seasons}=await db.from("seasons").select("season_number,title,status").eq("series_id",series.id).order("season_number",{ascending:true});
  const rows:any[]=(seasons??[]).map((x:any)=>[{text:`الموسم ${x.season_number}`,callback_data:`batch_season|${series.public_id}|${x.season_number}`}]);
  rows.push([{text:"موسم جديد",callback_data:`batch_newseason|${series.public_id}`}]);
  rows.push([{text:"رجوع",callback_data:"batch_episode"}]);
  return send(chatId,`${series.title}\n\nاختر الموسم:`,{inline_keyboard:rows});
}

function parseBatchEpisodeCaption(value:string,nextEpisode:number){
  const parts=value.split("|").map(x=>x.trim()).filter(Boolean);
  let episode=nextEpisode,title="",variant="default",explicitEpisode=false;
  if(parts.length){
    const m=parts[0].match(/^(?:e|ep|حلقة)?\s*(\d{1,4})$/i);
    if(m){episode=Number(m[1]);explicitEpisode=true;parts.shift();}
  }
  for(const p of parts){
    const compact=p.toLowerCase().replace(/\s+/g,"");
    if(/^(?:\d{3,4}p|4k|default)$/.test(compact))variant=normalizeVariant(compact);
    else if(!title)title=p.slice(0,180);
    else title=(title+" | "+p).slice(0,180);
  }
  return {episode_number:episode,title:title||`الحلقة ${episode}`,variant,explicitEpisode};
}

function batchEpisodeSummary(d:any){
  const items:any[]=Array.isArray(d.items)?d.items:[];
  const grouped=new Map<number,any[]>();
  for(const x of items){const n=Number(x.episode_number);if(!grouped.has(n))grouped.set(n,[]);grouped.get(n)!.push(x);}
  const lines=[...grouped.entries()].sort((a,b)=>a[0]-b[0]).map(([n,arr])=>`E${String(n).padStart(2,"0")}: ${arr.map(x=>variantLabel(x.variant)).join(" / ")}`);
  return `معاينة الرفع الجماعي\n\n${d.series_title||d.series_public_id}\nالموسم: ${d.season_number}\nالحلقات: ${grouped.size}\nملفات الفيديو: ${items.length}\n\n${lines.slice(0,30).join("\n")}${lines.length>30?"\n…":""}`;
}

async function episodeHasVideo(seriesPublicId:string,seasonNumber:number,episodeNumber:number){
  const series:any=await contentByPublicId("series",seriesPublicId);if(!series)return false;
  const {data:season}=await db.from("seasons").select("id").eq("series_id",series.id).eq("season_number",seasonNumber).maybeSingle();
  if(!season)return false;
  const {data:ep}=await db.from("episodes").select("id").eq("season_id",season.id).eq("episode_number",episodeNumber).maybeSingle();
  if(!ep)return false;
  const {count}=await db.from("media_assets").select("id",{head:true,count:"exact"}).eq("entity_type","episode").eq("entity_id",ep.id).eq("kind","video");
  return Number(count||0)>0;
}

async function publishBatchEpisodes(userId:number,chatId:number,d:any){
  const items:any[]=Array.isArray(d.items)?d.items:[];
  const grouped=new Map<number,any[]>();
  for(const x of items){const n=Number(x.episode_number);if(!grouped.has(n))grouped.set(n,[]);grouped.get(n)!.push(x);}
  const results:any[]=[];
  for(const [episodeNumber,files] of [...grouped.entries()].sort((a,b)=>a[0]-b[0])){
    if(await episodeHasVideo(d.series_public_id,Number(d.season_number),episodeNumber)){
      results.push({episode:episodeNumber,ok:false,error:"الحلقة تحتوي فيديو مسبقًا"});continue;
    }
    const sorted=[...files].sort((a,b)=>qualityRank(String(b.variant))-qualityRank(String(a.variant)));
    const first=sorted[0];
    try{
      const epPublicId=await publishEpisode(userId,chatId,{
        series_public_id:d.series_public_id,season_number:Number(d.season_number),episode_number:episodeNumber,
        title:first.title||`الحلقة ${episodeNumber}`,description:"",quality:variantLabel(first.variant),variant:first.variant,
        video:first.file,video_source_message_id:first.source_message_id
      });
      const ep:any=await episodeByPublicId(epPublicId);
      const failedVariants:string[]=[];
      for(const extra of sorted.slice(1)){
        try{
          await replaceStoredAsset({
            adminId:userId,chatId,entityType:"episode",entityId:ep.id,publicId:ep.public_id,kind:"video",channelKey:"series_storage",
            sourceMessageId:extra.source_message_id,file:extra.file,variant:extra.variant,
            caption:`${ep.public_id} | ${d.series_title||d.series_public_id} | موسم ${d.season_number} | حلقة ${episodeNumber} | ${variantLabel(extra.variant)}`
          });
        }catch{failedVariants.push(variantLabel(extra.variant));}
      }
      results.push({episode:episodeNumber,ok:true,public_id:epPublicId,failedVariants});
    }catch(err){results.push({episode:episodeNumber,ok:false,error:adminErrorText(err)});}
  }
  await adminLog(userId,"batch_episode_publish","series",undefined,d.series_public_id,{season_number:d.season_number,results});
  return results;
}


async function tmdbImportSeriesStructure(adminId:number,seriesPublicId:string,tmdbId:number){
  const series:any=await contentByPublicId("series",seriesPublicId);
  if(!series)throw new Error("المسلسل غير موجود.");
  const root:any=await tmdbApi(`/tv/${tmdbId}`,{language:"ar-SA"});
  const seasons=(Array.isArray(root.seasons)?root.seasons:[])
    .filter((x:any)=>Number(x.season_number)>0)
    .sort((a:any,b:any)=>Number(a.season_number)-Number(b.season_number))
    .slice(0,60);

  let seasonsAdded=0,seasonsUpdated=0,episodesAdded=0,episodesUpdated=0;
  const failed:number[]=[];

  for(let offset=0;offset<seasons.length;offset+=3){
    const chunk=seasons.slice(offset,offset+3);
    const bundles=await Promise.all(chunk.map(async (summary:any)=>{
      const n=Number(summary.season_number);
      try{
        const [ar,en]=await Promise.all([
          tmdbApi(`/tv/${tmdbId}/season/${n}`,{language:"ar-SA",append_to_response:"images,translations",include_image_language:"ar,en,null"}),
          tmdbApi(`/tv/${tmdbId}/season/${n}`,{language:"en-US"}),
        ]);
        return {n,ar,en,error:null};
      }catch(error){return {n,ar:null,en:null,error};}
    }));

    for(const b of bundles){
      if(b.error||!b.ar){failed.push(b.n);continue;}
      const ar:any=b.ar,en:any=b.en||{};
      const seasonTitle=String(ar.name||en.name||`الموسم ${b.n}`).trim();
      const seasonAir=safeIsoDate(ar.air_date||en.air_date);
      const {data:existingSeason}=await db.from("seasons")
        .select("id,status,title,external_source")
        .eq("series_id",series.id).eq("season_number",b.n).maybeSingle();

      let season:any=existingSeason;
      if(existingSeason){
        const patch:any={
          external_source:"tmdb",external_id:Number(ar.id||en.id)||null,
          external_metadata:{primary:ar,fallback:en},air_date:seasonAir,updated_at:new Date().toISOString()
        };
        if(existingSeason.external_source==="tmdb"||!existingSeason.title||existingSeason.title===`الموسم ${b.n}`)patch.title=seasonTitle;
        const {data:updated,error}=await db.from("seasons").update(patch).eq("id",existingSeason.id).select("id,status,title,external_source").single();
        if(error)throw error;season=updated;seasonsUpdated++;
      }else{
        const {data:created,error}=await db.from("seasons").insert({
          series_id:series.id,season_number:b.n,title:seasonTitle,status:"draft",
          external_source:"tmdb",external_id:Number(ar.id||en.id)||null,
          external_metadata:{primary:ar,fallback:en},air_date:seasonAir
        }).select("id,status,title,external_source").single();
        if(error||!created)throw error??new Error("Season import failed");
        season=created;seasonsAdded++;
      }

      const arEpisodes=Array.isArray(ar.episodes)?ar.episodes:[];
      const enMap=new Map<number,any>((Array.isArray(en.episodes)?en.episodes:[]).map((x:any)=>[Number(x.episode_number),x]));
      const {data:existingEpisodes}=await db.from("episodes")
        .select("id,episode_number,title,description,duration_minutes,external_source")
        .eq("season_id",season.id);
      const existingMap=new Map<number,any>((existingEpisodes??[]).map((x:any)=>[Number(x.episode_number),x]));

      for(const epAr of arEpisodes){
        const n=Number(epAr.episode_number);if(!Number.isInteger(n)||n<1)continue;
        const epEn:any=enMap.get(n)||{};
        const title=String(epAr.name||epEn.name||`الحلقة ${n}`).trim();
        const description=String(epAr.overview||epEn.overview||"").trim();
        const duration=Number(epAr.runtime||epEn.runtime)||null;
        const airDate=safeIsoDate(epAr.air_date||epEn.air_date);
        const rating=Number(epAr.vote_average||epEn.vote_average)||null;
        const ratingCount=Number(epAr.vote_count||epEn.vote_count)||null;
        const existing:any=existingMap.get(n);

        if(existing){
          const patch:any={
            external_source:"tmdb",external_id:Number(epAr.id||epEn.id)||null,
            external_metadata:{primary:epAr,fallback:epEn},
            air_date:airDate,rating,rating_count:ratingCount,updated_at:new Date().toISOString()
          };
          if(existing.external_source==="tmdb"||!existing.title||existing.title===`الحلقة ${n}`)patch.title=title;
          if(existing.external_source==="tmdb"||!existing.description)patch.description=description;
          if(existing.external_source==="tmdb"||!existing.duration_minutes)patch.duration_minutes=duration;
          const {error}=await db.from("episodes").update(patch).eq("id",existing.id);if(error)throw error;
          episodesUpdated++;
        }else{
          const {error}=await db.from("episodes").insert({
            season_id:season.id,episode_number:n,title,description,duration_minutes:duration,quality:"",
            status:"draft",external_source:"tmdb",external_id:Number(epAr.id||epEn.id)||null,
            external_metadata:{primary:epAr,fallback:epEn},air_date:airDate,rating,rating_count:ratingCount,created_by:adminId
          });
          if(error)throw error;episodesAdded++;
        }
      }
    }
  }

  const result={seasons_total:seasons.length,seasons_added:seasonsAdded,seasons_updated:seasonsUpdated,episodes_added:episodesAdded,episodes_updated:episodesUpdated,failed_seasons:failed};
  await adminLog(adminId,"tmdb_series_structure_import","series",series.id,series.public_id,{tmdb_id:tmdbId,...result});
  return result;
}

async function sendEpisodeSeriesPicker(chatId:number){
  const {data,error}=await db.from("series").select("public_id,title,status").eq("status","published").order("updated_at",{ascending:false}).limit(20);
  if(error)throw error;
  const rows:any[]=(data??[]).map((x:any)=>[{text:String(x.title).slice(0,34),callback_data:`add_episode_for|${x.public_id}`}]);
  rows.push([{text:"رجوع",callback_data:"menu"}]);
  return send(chatId,(data??[]).length?"إضافة حلقة\n\nاختر المسلسل أولًا:":"لا توجد مسلسلات منشورة بعد.",{inline_keyboard:rows});
}

async function sendEpisodeSeasonPicker(chatId:number,seriesPublicId:string){
  const series:any=await contentByPublicId("series",seriesPublicId);
  if(!series)return sendEpisodeSeriesPicker(chatId);
  const {data:seasons}=await db.from("seasons").select("season_number,title,status").eq("series_id",series.id).order("season_number",{ascending:true});
  const rows:any[]=(seasons??[]).map((x:any)=>[{text:`الموسم ${x.season_number}${x.title&&x.title!==`الموسم ${x.season_number}`?" • "+String(x.title).slice(0,20):""}`,callback_data:`ae_season|${series.public_id}|${x.season_number}`}]);
  rows.push([{text:"موسم جديد",callback_data:`ae_newseason|${series.public_id}`}]);
  rows.push([{text:"رجوع للمسلسلات",callback_data:"add_episode"}]);
  return send(chatId,`${series.title}\n\nاختر الموسم الذي ستضيف له الحلقة:`,{inline_keyboard:rows});
}

async function sendContentItem(chatId:number,type:string,publicId:string){
  const item:any=await contentByPublicId(type,publicId);
  if(!item)return sendContentManager(chatId);
  const nextStatus=item.status==="published"?"hidden":"published";
  const rows:any[]=[
    [{text:"تعديل البيانات",callback_data:`ce|${type}|${item.public_id}`},{text:"استبدال البوستر",callback_data:`cp|${type}|${item.public_id}`}],
    [type==="movie"
      ?{text:"إدارة الجودات",callback_data:`q|movie|${item.public_id}`}
      :{text:"المواسم والحلقات",callback_data:`se|${item.public_id}`}],
    ...(type==="series"&&item.external_source==="tmdb"&&item.external_id
      ?[[{text:"تحديث مواسم وحلقات TMDb",callback_data:`tmdb_sync|${item.public_id}`}]]
      :[]),
    [{text:nextStatus==="published"?"نشر المحتوى":"إخفاء المحتوى",callback_data:`cs|${type}|${item.public_id}|${nextStatus}`}],
    [{text:item.is_featured?"إلغاء التمييز":"تمييز في الرئيسية",callback_data:`cf|${type}|${item.public_id}|${item.is_featured?"0":"1"}`}],
    [{text:"حذف",callback_data:`cd1|${type}|${item.public_id}`}],
    [{text:"رجوع",callback_data:"content"}],
  ];
  const extra=type==="movie"
    ?`\nالسنة: ${item.release_year||"—"}\nالمدة: ${item.duration_minutes||"—"} دقيقة`
    :`\nالسنة: ${item.release_year||"—"}`;
  return send(chatId,
    `${item.public_id}\n${item.title}\n\nالحالة: ${item.status}\nمميز: ${item.is_featured?"نعم":"لا"}\nالجودة: ${item.quality||"—"}\nالمشاهدات: ${item.view_count||0}${item.rating?"\nالتقييم: "+Number(item.rating).toFixed(1)+"/10":""}${item.external_source==="tmdb"&&item.external_id?"\nTMDb ID: "+item.external_id:""}${extra}`,
    {inline_keyboard:rows}
  );
}

async function deleteContent(adminId:number,type:string,publicId:string){
  const item:any=await contentByPublicId(type,publicId);
  if(!item)throw new Error("المحتوى غير موجود");
  const places:any[]=[];

  if(type==="movie"){
    const {data:assets}=await db.from("media_assets").select("channel_id,channel_message_id").eq("entity_type","movie").eq("entity_id",item.id);
    places.push(...(assets??[]).map((x:any)=>({channel_id:x.channel_id,message_id:x.channel_message_id})));
    for(const p of places)await deleteCopiedMessage(p);
    await db.from("media_assets").delete().eq("entity_type","movie").eq("entity_id",item.id);
    const {error}=await db.from("movies").delete().eq("id",item.id);if(error)throw error;
  }else{
    const {data:seasons}=await db.from("seasons").select("id").eq("series_id",item.id);
    const seasonIds=(seasons??[]).map((x:any)=>x.id);
    let episodeIds:string[]=[];
    if(seasonIds.length){
      const {data:eps}=await db.from("episodes").select("id").in("season_id",seasonIds);
      episodeIds=(eps??[]).map((x:any)=>x.id);
    }
    const {data:seriesAssets}=await db.from("media_assets").select("channel_id,channel_message_id").eq("entity_type","series").eq("entity_id",item.id);
    places.push(...(seriesAssets??[]).map((x:any)=>({channel_id:x.channel_id,message_id:x.channel_message_id})));
    if(episodeIds.length){
      const {data:episodeAssets}=await db.from("media_assets").select("channel_id,channel_message_id").eq("entity_type","episode").in("entity_id",episodeIds);
      places.push(...(episodeAssets??[]).map((x:any)=>({channel_id:x.channel_id,message_id:x.channel_message_id})));
      await db.from("media_assets").delete().eq("entity_type","episode").in("entity_id",episodeIds);
    }
    for(const p of places)await deleteCopiedMessage(p);
    await db.from("media_assets").delete().eq("entity_type","series").eq("entity_id",item.id);
    const {error}=await db.from("series").delete().eq("id",item.id);if(error)throw error;
  }
  await adminLog(adminId,"content_delete",type,item.id,item.public_id,{title:item.title});
}

async function sendRequestsManager(chatId:number){
  const {data}=await db.from("content_requests").select("request_code,request_type,title,status,linked_entity_type,linked_entity_id")
    .order("created_at",{ascending:false}).limit(6);
  const rows:any[]=[];
  for(const x of data??[]){
    if(!["added","rejected","duplicate"].includes(x.status)){
      rows.push([
        {text:`مراجعة ${x.request_code}`,callback_data:`rq|${x.request_code}|reviewing`},
        {text:"ربط بالمحتوى",callback_data:`rql|${x.request_code}`},
        {text:"رفض",callback_data:`rq|${x.request_code}|rejected`},
      ]);
    }
  }
  rows.push([{text:"رجوع للقائمة",callback_data:"menu"}]);
  return send(chatId,
    "طلبات المستخدمين:\n"+((data??[]).map((x:any)=>`• ${x.request_code} | ${x.title} | ${x.status}${x.linked_entity_id?" | مرتبط":""}`).join("\n")||"لا توجد طلبات"),
    {inline_keyboard:rows}
  );
}

async function sendReportsManager(chatId:number){
  const {data}=await db.from("reports").select("report_code,entity_public_id,reason,status")
    .order("created_at",{ascending:false}).limit(6);
  const rows:any[]=[];
  const lines:any[]=[];
  for(const x of data??[]){
    let related=1;
    if(x.entity_public_id){
      const {count}=await db.from("reports").select("id",{head:true,count:"exact"}).eq("entity_public_id",x.entity_public_id).in("status",["new","reviewing"]);
      related=count||1;
    }
    lines.push(`• ${x.report_code} | ${x.entity_public_id||"—"} | ${x.reason} | ${x.status}${related>1?" | "+related+" بلاغات":""}`);
    if(!["resolved","rejected"].includes(x.status)){
      rows.push([
        {text:`مراجعة ${x.report_code}`,callback_data:`rp|${x.report_code}|reviewing`},
        {text:"تم الحل",callback_data:`rp|${x.report_code}|resolved`},
        {text:"رفض",callback_data:`rp|${x.report_code}|rejected`},
      ]);
    }
  }
  rows.push([{text:"رجوع للقائمة",callback_data:"menu"}]);
  return send(chatId,"البلاغات:\n"+(lines.join("\n")||"لا توجد بلاغات"),{inline_keyboard:rows});
}

async function systemStatusText(){
  const [mp,md,sp,ep,rq,rp,lastError]=await Promise.all([
    db.from("movies").select("id",{head:true,count:"exact"}).eq("status","published"),
    db.from("movies").select("id",{head:true,count:"exact"}).eq("status","draft"),
    db.from("series").select("id",{head:true,count:"exact"}).eq("status","published"),
    db.from("episodes").select("id",{head:true,count:"exact"}).eq("status","published"),
    db.from("content_requests").select("id",{head:true,count:"exact"}).eq("status","new"),
    db.from("reports").select("id",{head:true,count:"exact"}).eq("status","new"),
    db.from("system_logs").select("message,created_at").eq("level","error").order("created_at",{ascending:false}).limit(1),
  ]);
  let gateway="غير متصل",telegram="غير معروف",activeStreams=0,rangeWindow=0;
  try{
    const base=await streamGateway();
    if(base){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),6000);
      try{
        const res=await fetch(base+"/health",{signal:controller.signal});
        const j=await res.json().catch(()=>null);
        gateway=res.ok&&j?.ok?"يعمل":`HTTP ${res.status}`;
        telegram=j?.ok?"متصل":"غير متصل";
        activeStreams=Number(j?.active_streams||0);
        rangeWindow=Number(j?.range_window_mb||0);
      }finally{clearTimeout(timer)}
    }
  }catch{gateway="غير متصل"}
  const le=(lastError.data??[])[0];
  return [
    "حالة VAYZEN",
    "",
    `البوت: ${BOT_TOKEN?"مهيأ":"غير مهيأ"}`,
    `بوابة البث: ${gateway}`,
    `Telegram Streaming: ${telegram}`,
    `عمليات البث الحالية: ${activeStreams}`,
    `نافذة Range: ${rangeWindow||"—"} MB`,
    "حد الفيديو: 800 MB",
    `أفلام منشورة: ${mp.count||0}`,
    `مسودات أفلام: ${md.count||0}`,
    `مسلسلات منشورة: ${sp.count||0}`,
    `حلقات منشورة: ${ep.count||0}`,
    `طلبات جديدة: ${rq.count||0}`,
    `بلاغات جديدة: ${rp.count||0}`,
    "",
    `آخر خطأ: ${le?.message?String(le.message).slice(0,140):"لا يوجد"}`,
  ].join("\n");
}


async function sendTmdbSettings(chatId:number){
  const status=await tmdbStatus();
  const state=status.configured?"متصل":"غير مربوط";
  const hint=status.configured&&status.hint?`••••••${status.hint}`:"—";
  const rows:any[]=[
    [{text:status.configured?"تغيير Access Token":"إضافة Access Token",callback_data:"tmdb_token_set"}],
  ];
  if(status.configured){
    rows.push([{text:"اختبار الاتصال",callback_data:"tmdb_token_test"},{text:"حذف الربط",callback_data:"tmdb_token_del1"}]);
  }
  rows.push([{text:"رجوع",callback_data:"menu"}]);
  return send(chatId,`إعدادات TMDb\n\nالحالة: ${state}\nالتوكن: ${hint}\nالـAPI: ${TMDB_API_BASE}\n\nالإضافة اليدوية تبقى مستقلة حتى إذا TMDb غير متصل.`,{inline_keyboard:rows});
}

async function sendTmdbSearchResults(chatId:number,type:"movie"|"series",query:string){
  const rowsData:any[]=await tmdbSearch(type,query);
  if(!rowsData.length)return send(chatId,"ما لقيت نتائج مطابقة. جرّب الاسم الأصلي أو سنة الإصدار.",{inline_keyboard:[[{text:"بحث جديد",callback_data:`tmdb_again|${type==="movie"?"m":"s"}`},{text:"إلغاء",callback_data:"cancel"}]]});
  const rows:any[]=rowsData.map((x:any)=>{
    const title=String(type==="movie"?(x.title||x.original_title):(x.name||x.original_name)||"بدون اسم");
    const date=String(type==="movie"?x.release_date:x.first_air_date||"");
    const year=/^\d{4}/.test(date)?date.slice(0,4):"—";
    return [{text:`${title.slice(0,36)} • ${year}`,callback_data:`tmdb_pick|${type==="movie"?"m":"s"}|${x.id}`}];
  });
  rows.push([{text:"بحث جديد",callback_data:`tmdb_again|${type==="movie"?"m":"s"}`},{text:"إلغاء",callback_data:"cancel"}]);
  return send(chatId,`نتائج TMDb لـ: ${query}\n\nاختر النتيجة الصحيحة:`,{inline_keyboard:rows});
}

async function tmdbMappedDetails(type:"movie"|"series",tmdbId:number){
  const bundle=await tmdbDetails(type,tmdbId);
  const mapped=tmdbMap(type,bundle);
  mapped.poster_url=await tmdbImageUrl(mapped.poster_path,"poster");
  mapped.backdrop_url=await tmdbImageUrl(mapped.backdrop_path,"backdrop");
  return {bundle,mapped};
}

async function callback(q:any){
  const userId=Number(q.from?.id||0);
  const chatId=Number(q.message?.chat?.id||userId);
  const a=String(q.data||"");

  // Acknowledge immediately. Telegram callback IDs expire quickly and database work
  // must never delay this response.
  try{await tg("answerCallbackQuery",{callback_query_id:q.id});}catch{}

  const admin=await getAdmin(userId);
  if(!admin)return send(chatId,"غير مصرح لك باستخدام لوحة الإدارة.");

  if(a==="menu")return showMenu(chatId);
  if(a==="cancel"){
    await clearSession(userId);
    return showMenu(chatId,"تم إلغاء العملية.");
  }
  if(a==="bot_ui_settings"){
    if(admin.role!=="owner")return send(chatId,"إعدادات هوية البوت متاحة للمالك فقط.");
    const status=await botUiStatus();
    const ready=status.status==="ready";
    const stateText=ready?`مفعلة • ${status.count} أيقونة`:status.status==="unsupported"?"الألوان مفعلة • الأيقونات تحتاج إعادة تهيئة":"بانتظار التهيئة";
    const extra=!ready&&status.error?`\n\nآخر نتيجة: ${status.error.slice(0,180)}`:"";
    return send(chatId,`هوية أزرار VAYZEN\n\nألوان الأزرار: مفعلة\nالأيقونات المخصصة: ${stateText}${extra}\n\nالنظام يحافظ على نفس الوظائف ويغير الشكل فقط.`,{inline_keyboard:[
      [{text:ready?"إعادة تهيئة الأيقونات":"تفعيل الأيقونات",callback_data:"bot_ui_setup"}],
      [{text:"رجوع",callback_data:"menu"}]
    ]});
  }
  if(a==="bot_ui_setup"){
    if(admin.role!=="owner")return send(chatId,"إعدادات هوية البوت متاحة للمالك فقط.");
    await send(chatId,"جاري تجهيز مجموعة أيقونات VAYZEN...");
    const result:any=await ensureBotUiIcons(userId,true);
    if(result.status==="ready"){
      return send(chatId,`تم تفعيل أيقونات VAYZEN بنجاح.\nالعدد: ${Object.keys(result.icons||{}).length}`,{inline_keyboard:[[{text:"العودة للوحة الإدارة",callback_data:"menu"}]]});
    }
    return send(chatId,`تم تفعيل ألوان الأزرار، لكن Telegram لم يسمح بالأيقونات المخصصة حاليًا.\n\n${String(result.error||"").slice(0,220)}`,{inline_keyboard:[[{text:"رجوع",callback_data:"bot_ui_settings"}]]});
  }
  if(a==="tmdb_settings"){
    if(admin.role!=="owner")return send(chatId,"إعدادات TMDb متاحة للمالك فقط.");
    await clearSession(userId);
    return sendTmdbSettings(chatId);
  }
  if(a==="tmdb_token_set"){
    if(admin.role!=="owner")return send(chatId,"إعدادات TMDb متاحة للمالك فقط.");
    await setSession(userId,"tmdb_settings","token",{});
    return send(chatId,"أرسل API Read Access Token الخاص بـTMDb.\n\nسأختبره أولًا، ثم يُحفظ مشفّرًا ولن يظهر كاملًا بعد الحفظ.");
  }
  if(a==="tmdb_token_test"){
    if(admin.role!=="owner")return send(chatId,"إعدادات TMDb متاحة للمالك فقط.");
    try{
      await tmdbApi("/configuration");
      const row:any=await tmdbSetting();
      const value={...(row?.value||{}),verified_at:new Date().toISOString()};
      await db.from("app_settings").upsert({key:"tmdb",value,updated_at:new Date().toISOString()});
      return send(chatId,"اتصال TMDb يعمل بشكل صحيح.",{inline_keyboard:[[{text:"رجوع",callback_data:"tmdb_settings"}]]});
    }catch(err){return send(chatId,`فشل اتصال TMDb.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"رجوع",callback_data:"tmdb_settings"}]]});}
  }
  if(a==="tmdb_token_del1"){
    if(admin.role!=="owner")return send(chatId,"إعدادات TMDb متاحة للمالك فقط.");
    return send(chatId,"تأكيد حذف ربط TMDb؟\nلن يتأثر أي فيلم أو مسلسل تم استيراده سابقًا.",{inline_keyboard:[[{text:"تأكيد الحذف",callback_data:"tmdb_token_del2"}],[{text:"تراجع",callback_data:"tmdb_settings"}]]});
  }
  if(a==="tmdb_token_del2"){
    if(admin.role!=="owner")return send(chatId,"إعدادات TMDb متاحة للمالك فقط.");
    await db.from("app_settings").delete().eq("key","tmdb");
    await adminLog(userId,"tmdb_disconnect","settings",undefined,"tmdb",{});
    return sendTmdbSettings(chatId);
  }
  if(a==="add_movie"){
    if(!can(admin,"content")||!can(admin,"publish")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await clearSession(userId);
    return send(chatId,"طريقة إضافة الفيلم:",{inline_keyboard:[
      [{text:"إدخال يدوي",callback_data:"add_movie_manual"},{text:"جلب من TMDb",callback_data:"add_movie_tmdb"}],
      [{text:"إلغاء",callback_data:"cancel"}]
    ]});
  }
  if(a==="add_movie_manual"){
    if(!can(admin,"content")||!can(admin,"publish")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await setSession(userId,"movie","title",{});
    return send(chatId,"أرسل اسم الفيلم.");
  }
  if(a==="add_movie_tmdb"){
    if(!can(admin,"content")||!can(admin,"publish")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const status=await tmdbStatus();
    if(!status.configured)return send(chatId,"TMDb غير مربوط حاليًا. استخدم الإدخال اليدوي أو اطلب من الـOwner إضافة Access Token.",{inline_keyboard:[[{text:"إدخال يدوي",callback_data:"add_movie_manual"},{text:"رجوع",callback_data:"menu"}]]});
    await setSession(userId,"tmdb_search","query",{type:"movie"});
    return send(chatId,"أرسل اسم الفيلم للبحث في TMDb.");
  }
  if(a==="add_series"){
    if(!can(admin,"content")||!can(admin,"publish")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await clearSession(userId);
    return send(chatId,"طريقة إضافة المسلسل:",{inline_keyboard:[
      [{text:"إدخال يدوي",callback_data:"add_series_manual"},{text:"جلب من TMDb",callback_data:"add_series_tmdb"}],
      [{text:"إلغاء",callback_data:"cancel"}]
    ]});
  }
  if(a==="add_series_manual"){
    if(!can(admin,"content")||!can(admin,"publish")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await setSession(userId,"series","title",{});
    return send(chatId,"أرسل اسم المسلسل.");
  }
  if(a==="add_series_tmdb"){
    if(!can(admin,"content")||!can(admin,"publish")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const status=await tmdbStatus();
    if(!status.configured)return send(chatId,"TMDb غير مربوط حاليًا. استخدم الإدخال اليدوي أو اطلب من الـOwner إضافة Access Token.",{inline_keyboard:[[{text:"إدخال يدوي",callback_data:"add_series_manual"},{text:"رجوع",callback_data:"menu"}]]});
    await setSession(userId,"tmdb_search","query",{type:"series"});
    return send(chatId,"أرسل اسم المسلسل للبحث في TMDb.");
  }
  if(a.startsWith("tmdb_again|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,short]=a.split("|");const type=short==="s"?"series":"movie";
    await setSession(userId,"tmdb_search","query",{type});
    return send(chatId,`أرسل اسم ${type==="movie"?"الفيلم":"المسلسل"} للبحث من جديد.`);
  }
  if(a.startsWith("tmdb_pick|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,short,idRaw]=a.split("|");const type=short==="s"?"series":"movie";const tmdbId=Number(idRaw);
    if(!Number.isInteger(tmdbId)||tmdbId<=0)return send(chatId,"TMDb ID غير صالح.");
    const existing:any=await tmdbExisting(type,tmdbId);
    if(existing)return send(chatId,`هذا المحتوى موجود مسبقًا في VAYZEN.\n${existing.title}\nID: ${existing.public_id}`,{inline_keyboard:[[{text:"إدارة المحتوى",callback_data:`cm|${type}|${existing.public_id}`},{text:"بحث جديد",callback_data:`tmdb_again|${short}`}]]});
    try{
      const {bundle,mapped}=await tmdbMappedDetails(type,tmdbId);
      if(!mapped.title)return send(chatId,"تعذر قراءة اسم هذه النتيجة.");
      const preview=await sendTmdbPreview(chatId,type,mapped,bundle);
      await setSession(userId,"tmdb_preview","selected",{
        type,tmdb_id:tmdbId,poster:preview.poster,poster_source_message_id:preview.poster_source_message_id
      });
      return;
    }catch(err){return send(chatId,`تعذر جلب تفاصيل TMDb.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"بحث جديد",callback_data:`tmdb_again|${short}`},{text:"إلغاء",callback_data:"cancel"}]]});}
  }
  if(a.startsWith("tmdb_use|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,short,idRaw]=a.split("|");const type=short==="s"?"series":"movie";const tmdbId=Number(idRaw);
    const session=await getSession(userId);
    if(!session||session.flow!=="tmdb_preview"||Number((session.draft as any)?.tmdb_id)!==tmdbId||String((session.draft as any)?.type)!==type){
      return send(chatId,"انتهت معاينة TMDb. أعد البحث.",{inline_keyboard:[[{text:"بحث جديد",callback_data:`tmdb_again|${short}`}]]});
    }
    const existing:any=await tmdbExisting(type,tmdbId);
    if(existing){await clearSession(userId);return send(chatId,`هذا المحتوى موجود مسبقًا.\nID: ${existing.public_id}`);}
    try{
      const {mapped}=await tmdbMappedDetails(type,tmdbId);
      const preview:any=session.draft||{};
      const draft:any={...mapped,tmdb_imported:true};
      delete draft.poster_path;delete draft.backdrop_path;delete draft.poster_url;
      if(preview.poster){draft.poster=preview.poster;draft.poster_source_message_id=preview.poster_source_message_id;}
      if(type==="movie"){
        if(!draft.poster){await setSession(userId,"movie","poster",draft);return send(chatId,"تم استيراد معلومات الفيلم، لكن TMDb ما عنده بوستر صالح. أرسل بوستر الفيلم.");}
        await setSession(userId,"movie","quality",draft);
        return send(chatId,`تم استيراد معلومات الفيلم من TMDb.\n\n${movieSummary(draft)}\n\nأرسل جودة أول فيديو، مثال 1080p.`);
      }
      if(!draft.poster){await setSession(userId,"series","poster",draft);return send(chatId,"تم استيراد معلومات المسلسل، لكن TMDb ما عنده بوستر صالح. أرسل بوستر المسلسل.");}
      await setSession(userId,"series","confirm",draft);
      return send(chatId,seriesSummary(draft),{inline_keyboard:[
        [{text:"نشر المعلومات فقط",callback_data:"confirm_series"},{text:"استيراد المواسم والحلقات",callback_data:"confirm_series_tmdb_all"}],
        [{text:"إلغاء",callback_data:"cancel"}]
      ]});
    }catch(err){return send(chatId,`تعذر استيراد TMDb.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"بحث جديد",callback_data:`tmdb_again|${short}`},{text:"إلغاء",callback_data:"cancel"}]]});}
  }
  if(a==="batch_episode"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await clearSession(userId);
    return sendBatchSeriesPicker(chatId);
  }
  if(a.startsWith("batch_for|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,id]=a.split("|");return sendBatchSeasonPicker(chatId,id);
  }
  if(a.startsWith("batch_season|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,id,n]=a.split("|");
    const series:any=await contentByPublicId("series",id);if(!series)return sendBatchSeriesPicker(chatId);
    await setSession(userId,"batch_episode","start",{series_public_id:id,series_title:series.title,season_number:Number(n),items:[]});
    return send(chatId,`الموسم ${n}\nأرسل رقم أول حلقة، مثال: 1`);
  }
  if(a.startsWith("batch_newseason|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,id]=a.split("|");
    const series:any=await contentByPublicId("series",id);if(!series)return sendBatchSeriesPicker(chatId);
    await setSession(userId,"batch_episode","season",{series_public_id:id,series_title:series.title,items:[]});
    return send(chatId,"أرسل رقم الموسم الجديد.");
  }
  if(a==="batch_finish"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    if(!session||session.flow!=="batch_episode"||session.step!=="receiving")return showMenu(chatId,"لا توجد عملية رفع جماعي نشطة.");
    const draft:any=session.draft||{};
    if(!Array.isArray(draft.items)||!draft.items.length)return send(chatId,"لم ترسل أي فيديو بعد.");
    await setSession(userId,"batch_episode","confirm",draft);
    return send(chatId,batchEpisodeSummary(draft),{inline_keyboard:[
      [{text:"نشر الكل",callback_data:"confirm_batch_episode"},{text:"متابعة الإضافة",callback_data:"batch_resume"}],
      [{text:"إلغاء العملية",callback_data:"cancel"}]
    ]});
  }
  if(a==="batch_resume"){
    const session=await getSession(userId);
    if(!session||session.flow!=="batch_episode"||session.step!=="confirm")return showMenu(chatId);
    await setSession(userId,"batch_episode","receiving",session.draft);
    return send(chatId,"استمر بإرسال الفيديوهات. عند الانتهاء اضغط إنهاء ومراجعة.",{inline_keyboard:[[{text:"إنهاء ومراجعة",callback_data:"batch_finish"},{text:"إلغاء",callback_data:"cancel"}]]});
  }
  if(a==="confirm_batch_episode"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    if(!session||session.flow!=="batch_episode")return showMenu(chatId,"انتهت جلسة الرفع الجماعي.");
    if(session.step==="publishing")return send(chatId,"النشر الجماعي قيد التنفيذ الآن.");
    if(session.step!=="confirm")return showMenu(chatId,"انتهت جلسة الرفع الجماعي.");
    await setSession(userId,"batch_episode","publishing",session.draft);
    await send(chatId,"جاري نشر الحلقات والجودات...");
    const draft:any=session.draft||{};
    try{
      const results=await publishBatchEpisodes(userId,chatId,draft);
      await clearSession(userId);
      const ok=results.filter((x:any)=>x.ok).length,failed=results.length-ok;
      const partial=results.filter((x:any)=>x.ok&&x.failedVariants?.length);
      const failures=results.filter((x:any)=>!x.ok).map((x:any)=>`E${x.episode}: ${x.error}`).slice(0,12).join("\n");
      const partialText=partial.map((x:any)=>`E${x.episode}: فشل ${x.failedVariants.join(" / ")}`).slice(0,8).join("\n");
      return send(chatId,`اكتمل النشر الجماعي.\n\nنجح: ${ok}\nفشل: ${failed}${partial.length?`\nجودات جزئية: ${partial.length}`:""}${failures?`\n\nالفشل:\n${failures}`:""}${partialText?`\n\nجودات تحتاج إعادة محاولة:\n${partialText}`:""}`,{inline_keyboard:[[{text:"فتح المسلسل",callback_data:`se|${draft.series_public_id}`},{text:"القائمة",callback_data:"menu"}]]});
    }catch(err){
      await setSession(userId,"batch_episode","confirm",session.draft);
      return send(chatId,`فشل النشر الجماعي.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"إعادة المحاولة",callback_data:"confirm_batch_episode"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }

  if(a==="add_episode"){
    if(!can(admin,"content")||!can(admin,"publish")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await clearSession(userId);
    return sendEpisodeSeriesPicker(chatId);
  }
  if(a.startsWith("add_episode_for|")){
    if(!can(admin,"content")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,id]=a.split("|");
    return sendEpisodeSeasonPicker(chatId,id);
  }
  if(a.startsWith("ae_season|")){
    if(!can(admin,"content")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,id,n]=a.split("|");
    const seasonNumber=Number(n);
    await setSession(userId,"episode","episode",{series_public_id:id,season_number:seasonNumber});
    return send(chatId,`الموسم ${seasonNumber}\nأرسل رقم الحلقة.`);
  }
  if(a.startsWith("ae_newseason|")){
    if(!can(admin,"content")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    const [,id]=a.split("|");
    await setSession(userId,"episode","season",{series_public_id:id});
    return send(chatId,"أرسل رقم الموسم الجديد.");
  }
  if(a==="movie_add_quality"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    if(!session||session.flow!=="movie"||session.step!=="video_review")return showMenu(chatId,"انتهت جلسة الفيلم.");
    await setSession(userId,"movie","quality_extra",session.draft);
    return send(chatId,"أرسل اسم الجودة الإضافية، مثال: 480p أو 720p أو 1080p أو 4K.");
  }
  if(a==="confirm_movie"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    if(!session||session.flow!=="movie") return showMenu(chatId,"انتهت جلسة الفيلم.");
    if(session.step==="publishing")return send(chatId,"الفيلم قيد النشر الآن، انتظر اكتمال العملية.");
    if(!["confirm","video_review"].includes(session.step))return showMenu(chatId,"انتهت جلسة الفيلم.");
    await setSession(userId,"movie","publishing",session.draft);
    await send(chatId,"جاري نشر الفيلم ونقل الملفات...");
    try{
      const id=await publishMovie(userId,chatId,session.draft);
      await clearSession(userId);
      return showMenu(chatId,`تم نشر الفيلم بنجاح.\nMovie ID: ${id}`);
    }catch(err){
      await setSession(userId,"movie","confirm",session.draft);
      return send(chatId,`فشل نشر الفيلم.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"إعادة المحاولة",callback_data:"confirm_movie"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }
  if(a==="confirm_series_tmdb_all"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    const draft:any=session?.draft||{};
    if(!session||session.flow!=="series"||session.step!=="confirm"||draft.external_source!=="tmdb"||!draft.external_id){
      return showMenu(chatId,"انتهت جلسة استيراد TMDb.");
    }
    await setSession(userId,"series","publishing",draft);
    await send(chatId,"جاري نشر المسلسل ثم استيراد المواسم والحلقات من TMDb...");
    let id="";
    try{
      id=await publishSeries(userId,chatId,draft);
      const result=await tmdbImportSeriesStructure(userId,id,Number(draft.external_id));
      await clearSession(userId);
      const failed=(result.failed_seasons||[]).length?`\nمواسم تعذر جلبها: ${result.failed_seasons.join("، ")}`:"";
      await send(chatId,`تم استيراد المسلسل بنجاح.\nSeries ID: ${id}\n\nالمواسم الجديدة: ${result.seasons_added}\nالمواسم المحدثة: ${result.seasons_updated}\nالحلقات الجديدة: ${result.episodes_added}\nالحلقات المحدثة: ${result.episodes_updated}${failed}\n\nالحلقات المستوردة تبقى Draft إلى أن تربط الفيديو.`);
      return sendSeriesEpisodes(chatId,id);
    }catch(err){
      await clearSession(userId);
      if(id)return send(chatId,`تم نشر المسلسل، لكن تعذر إكمال استيراد المواسم.\nSeries ID: ${id}\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"فتح إدارة المسلسل",callback_data:`cm|series|${id}`},{text:"القائمة",callback_data:"menu"}]]});
      return send(chatId,`فشل نشر المسلسل.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"القائمة",callback_data:"menu"}]]});
    }
  }

  if(a==="confirm_series_batch"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    if(!session||session.flow!=="series")return showMenu(chatId,"انتهت جلسة المسلسل.");
    if(session.step==="publishing")return send(chatId,"المسلسل قيد النشر الآن.");
    if(session.step!=="confirm")return showMenu(chatId,"انتهت جلسة المسلسل.");
    await setSession(userId,"series","publishing",session.draft);
    try{
      const id=await publishSeries(userId,chatId,session.draft);
      await clearSession(userId);
      await send(chatId,`تم نشر المسلسل بنجاح.\nSeries ID: ${id}`);
      return sendBatchSeasonPicker(chatId,id);
    }catch(err){
      await setSession(userId,"series","confirm",session.draft);
      return send(chatId,`فشل نشر المسلسل.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"إعادة المحاولة",callback_data:"confirm_series_batch"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }

  if(a==="confirm_series"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    if(!session||session.flow!=="series") return showMenu(chatId,"انتهت جلسة المسلسل.");
    if(session.step==="publishing")return send(chatId,"المسلسل قيد النشر الآن، انتظر اكتمال العملية.");
    if(session.step!=="confirm")return showMenu(chatId,"انتهت جلسة المسلسل.");
    await setSession(userId,"series","publishing",session.draft);
    await send(chatId,"جاري نشر المسلسل ونقل البوستر...");
    try{
      const id=await publishSeries(userId,chatId,session.draft);
      await clearSession(userId);
      return showMenu(chatId,`تم نشر المسلسل بنجاح.\nSeries ID: ${id}`);
    }catch(err){
      await setSession(userId,"series","confirm",session.draft);
      return send(chatId,`فشل نشر المسلسل.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"إعادة المحاولة",callback_data:"confirm_series"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }
  if(a==="confirm_episode"){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const session=await getSession(userId);
    if(!session||session.flow!=="episode") return showMenu(chatId,"انتهت جلسة الحلقة.");
    if(session.step==="publishing")return send(chatId,"الحلقة قيد النشر الآن، انتظر اكتمال العملية.");
    if(session.step!=="confirm")return showMenu(chatId,"انتهت جلسة الحلقة.");
    await setSession(userId,"episode","publishing",session.draft);
    await send(chatId,"جاري نشر الحلقة ونقل الفيديو...");
    try{
      const id=await publishEpisode(userId,chatId,session.draft);
      await clearSession(userId);
      return showMenu(chatId,`تم نشر الحلقة بنجاح.\nEpisode ID: ${id}`);
    }catch(err){
      await setSession(userId,"episode","confirm",session.draft);
      return send(chatId,`فشل نشر الحلقة.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"إعادة المحاولة",callback_data:"confirm_episode"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }

  if(a.startsWith("tmdb_sync|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية تحديث المحتوى.");
    const [,publicId]=a.split("|");
    const item:any=await contentByPublicId("series",publicId);
    if(!item||item.external_source!=="tmdb"||!item.external_id)return send(chatId,"هذا المسلسل غير مرتبط بـTMDb.");
    try{
      await send(chatId,"جاري تحديث المواسم والحلقات من TMDb...");
      const result=await tmdbImportSeriesStructure(userId,item.public_id,Number(item.external_id));
      const failed=(result.failed_seasons||[]).length?`\nتعذر تحديث المواسم: ${result.failed_seasons.join("، ")}`:"";
      await send(chatId,`اكتمل تحديث TMDb.\n\nمواسم جديدة: ${result.seasons_added}\nمواسم محدثة: ${result.seasons_updated}\nحلقات جديدة: ${result.episodes_added}\nحلقات محدثة: ${result.episodes_updated}${failed}`);
      return sendSeriesEpisodes(chatId,item.public_id);
    }catch(err){return send(chatId,`فشل تحديث TMDb.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"رجوع",callback_data:`cm|series|${publicId}`}]]});}
  }

  if(a==="content"){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    return sendContentManager(chatId);
  }
  if(a==="content_movies"){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    return sendContentList(chatId,"movie");
  }
  if(a==="content_series"){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    return sendContentList(chatId,"series");
  }
  if(a==="content_search"){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    await setSession(userId,"search_content","query",{});
    return send(chatId,"أرسل اسم الفيلم أو المسلسل أو الـ ID.");
  }
  if(a.startsWith("content_search_type|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type]=a.split("|");
    await setSession(userId,"search_content","query",{type});
    return send(chatId,type==="movie"?"ابحث باسم الفيلم أو Movie ID.":"ابحث باسم المسلسل أو Series ID.");
  }
  if(a.startsWith("cm|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type,id]=a.split("|");return sendContentItem(chatId,type,id);
  }
  if(a.startsWith("ce|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type,id]=a.split("|");return sendContentEditMenu(chatId,type,id);
  }
  if(a.startsWith("cef|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type,id,field]=a.split("|");
    const allowed=["title","description","release_year","genres","language","country","quality","duration_minutes"];
    if(!allowed.includes(field)||(field==="duration_minutes"&&type!=="movie"))return sendContentEditMenu(chatId,type,id);
    await setSession(userId,"edit_content","value",{type,public_id:id,field});
    const labels:any={title:"الاسم",description:"الوصف",release_year:"السنة",genres:"التصنيفات مفصولة بفواصل",language:"اللغة",country:"الدولة",quality:"الجودة",duration_minutes:"المدة بالدقائق"};
    return send(chatId,`أرسل القيمة الجديدة لـ ${labels[field]||field}.\nاستخدم - لمسح الحقل الاختياري.`);
  }
  if(a.startsWith("cp|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type,id]=a.split("|");
    if(!["movie","series"].includes(type))return sendContentManager(chatId);
    await setSession(userId,"replace_poster","file",{type,public_id:id});
    return send(chatId,"أرسل البوستر الجديد الآن.");
  }
  if(a.startsWith("cv|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const [,type,id]=a.split("|");
    if(type!=="movie")return sendContentManager(chatId);
    await setSession(userId,"replace_movie_video","file",{type,public_id:id});
    return send(chatId,"أرسل فيديو الفيلم الجديد. الحد الأقصى 800MB.");
  }
  if(a.startsWith("se|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,id]=a.split("|");return sendSeriesEpisodes(chatId,id);
  }
  if(a.startsWith("season|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,id,n]=a.split("|");return sendSeasonEpisodes(chatId,id,Number(n));
  }
  if(a.startsWith("ss|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const [,id,n,status]=a.split("|");
    if(!["published","hidden"].includes(status))return sendSeasonEpisodes(chatId,id,Number(n));
    const series:any=await contentByPublicId("series",id);if(!series)return sendContentList(chatId,"series");
    const {error}=await db.from("seasons").update({status,updated_at:new Date().toISOString()}).eq("series_id",series.id).eq("season_number",Number(n));
    if(error)throw error;
    await adminLog(userId,"season_status","series",series.id,series.public_id,{season_number:Number(n),status});
    return sendSeasonEpisodes(chatId,id,Number(n));
  }
  if(a.startsWith("sedit|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,id,n]=a.split("|");
    await setSession(userId,"edit_season","title",{series_public_id:id,season_number:Number(n)});
    return send(chatId,"أرسل الاسم الجديد للموسم.");
  }
  if(a.startsWith("sd1|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,id,n]=a.split("|");
    return send(chatId,`تأكيد حذف الموسم ${n} بكل حلقاته؟`,{inline_keyboard:[
      [{text:"تأكيد الحذف",callback_data:`sd2|${id}|${n}`}],
      [{text:"تراجع",callback_data:`season|${id}|${n}`}],
    ]});
  }
  if(a.startsWith("sd2|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,id,n]=a.split("|");
    await deleteSeason(userId,id,Number(n));
    return sendSeriesEpisodes(chatId,id);
  }
  if(a.startsWith("epi|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,id]=a.split("|");return sendEpisodeItem(chatId,id);
  }
  if(a.startsWith("q|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type,id]=a.split("|");return sendQualityManager(chatId,type,id);
  }
  if(a.startsWith("qv|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type,id,variant]=a.split("|");return sendQualityItem(chatId,type,id,variant);
  }
  if(a.startsWith("qa|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const [,type,id]=a.split("|");
    await setSession(userId,"add_quality","label",{type,public_id:id});
    return send(chatId,"أرسل اسم الجودة، مثال: 480p أو 720p أو 1080p أو 4K.");
  }
  if(a.startsWith("qr|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const [,type,id,variant]=a.split("|");
    await setSession(userId,"replace_quality","file",{type,public_id:id,variant:normalizeVariant(variant)});
    return send(chatId,`أرسل فيديو ${variantLabel(variant)} الجديد. الحد الأقصى 800MB.`);
  }
  if(a.startsWith("qd1|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,type,id,variant]=a.split("|");
    return send(chatId,`تأكيد حذف جودة ${variantLabel(variant)}؟`,{inline_keyboard:[
      [{text:"تأكيد الحذف",callback_data:`qd2|${type}|${id}|${variant}`}],
      [{text:"تراجع",callback_data:`qv|${type}|${id}|${variant}`}],
    ]});
  }
  if(a.startsWith("qd2|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,type,id,variant]=a.split("|");
    try{await deleteQuality(userId,type,id,variant);}
    catch(err){return send(chatId,adminErrorText(err),{inline_keyboard:[[{text:"رجوع",callback_data:`q|${type}|${id}`}]]});}
    return sendQualityManager(chatId,type,id);
  }
  if(a.startsWith("eps|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const [,id,status]=a.split("|");
    if(!["published","hidden"].includes(status))return sendEpisodeItem(chatId,id);
    const ep:any=await episodeByPublicId(id);if(!ep)return send(chatId,"الحلقة غير موجودة.");
    const {error}=await db.from("episodes").update({status,updated_at:new Date().toISOString()}).eq("id",ep.id);
    if(error)throw error;
    await adminLog(userId,"episode_status","episode",ep.id,ep.public_id,{status});
    return sendEpisodeItem(chatId,id);
  }
  if(a.startsWith("epe|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,id,field]=a.split("|");
    if(!["title","description","quality"].includes(field))return sendEpisodeItem(chatId,id);
    await setSession(userId,"edit_episode","value",{public_id:id,field});
    return send(chatId,`أرسل ${field==="title"?"اسم الحلقة":field==="description"?"وصف الحلقة":"الجودة"} الجديد.`);
  }
  if(a.startsWith("epv|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const [,id]=a.split("|");
    await setSession(userId,"replace_episode_video","file",{public_id:id});
    return send(chatId,"أرسل فيديو الحلقة الجديد. الحد الأقصى 800MB.");
  }
  if(a.startsWith("epd1|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,id]=a.split("|");
    return send(chatId,`تأكيد حذف الحلقة ${id}؟`,{inline_keyboard:[
      [{text:"تأكيد الحذف",callback_data:`epd2|${id}`}],
      [{text:"تراجع",callback_data:`epi|${id}`}],
    ]});
  }
  if(a.startsWith("epd2|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,id]=a.split("|");
    const ep:any=await episodeByPublicId(id);if(!ep)return send(chatId,"الحلقة غير موجودة.");
    const {data:assets}=await db.from("media_assets").select("channel_id,channel_message_id").eq("entity_type","episode").eq("entity_id",ep.id);
    for(const x of assets??[])await deleteCopiedMessage({channel_id:x.channel_id,message_id:x.channel_message_id});
    await db.from("media_assets").delete().eq("entity_type","episode").eq("entity_id",ep.id);
    const {error}=await db.from("episodes").delete().eq("id",ep.id);if(error)throw error;
    await adminLog(userId,"episode_delete","episode",ep.id,ep.public_id,{});
    return ep.series?.public_id?sendSeriesEpisodes(chatId,ep.series.public_id):sendContentManager(chatId);
  }
  if(a.startsWith("cs|")){
    if(!can(admin,"content")||!can(admin,"publish"))return send(chatId,"لا تملك صلاحية النشر.");
    const [,type,id,status]=a.split("|");
    if(!["published","hidden"].includes(status))return sendContentItem(chatId,type,id);
    const item:any=await contentByPublicId(type,id);if(!item)return sendContentManager(chatId);
    const table=type==="movie"?"movies":"series";
    const {error}=await db.from(table).update({status,updated_at:new Date().toISOString()}).eq("id",item.id);
    if(error)throw error;
    await adminLog(userId,"content_status",type,item.id,item.public_id,{status});
    return sendContentItem(chatId,type,id);
  }
  if(a.startsWith("cf|")){
    if(!can(admin,"content"))return send(chatId,"لا تملك صلاحية إدارة المحتوى.");
    const [,type,id,value]=a.split("|");
    const item:any=await contentByPublicId(type,id);if(!item)return sendContentManager(chatId);
    const table=type==="movie"?"movies":"series";
    const featured=value==="1";
    const {error}=await db.from(table).update({is_featured:featured,updated_at:new Date().toISOString()}).eq("id",item.id);
    if(error)throw error;
    await adminLog(userId,"content_feature",type,item.id,item.public_id,{featured});
    return sendContentItem(chatId,type,id);
  }
  if(a.startsWith("cd1|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,type,id]=a.split("|");
    return send(chatId,`تأكيد حذف ${id}؟ الحذف يزيله من التطبيق ومن تخزين البوت قدر الإمكان.`,{inline_keyboard:[
      [{text:"تأكيد الحذف",callback_data:`cd2|${type}|${id}`}],
      [{text:"تراجع",callback_data:`cm|${type}|${id}`}],
    ]});
  }
  if(a.startsWith("cd2|")){
    if(!can(admin,"delete_content"))return send(chatId,"لا تملك صلاحية حذف المحتوى.");
    const [,type,id]=a.split("|");
    await deleteContent(userId,type,id);
    return sendContentManager(chatId);
  }

  if(a.startsWith("adm_new_role|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,role]=a.split("|");
    const session=await getSession(userId);
    if(!session||session.flow!=="add_admin"||session.step!=="role")return sendAdminsManager(chatId,admin);
    const d:any=session.draft||{};
    try{
      await createAdmin(admin,Number(d.telegram_id),String(d.display_name||d.telegram_id),role);
      await clearSession(userId);
      return sendAdminsManager(chatId,admin);
    }catch(err){
      return send(chatId,adminErrorText(err),{inline_keyboard:[[{text:"رجوع",callback_data:"admins"}]]});
    }
  }

  if(a==="admins"){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    return sendAdminsManager(chatId,admin);
  }
  if(a==="admin_logs"){
    if(!can(admin,"logs")&&!can(admin,"admins"))return send(chatId,"لا تملك صلاحية مشاهدة السجلات.");
    return sendAdminLogs(chatId);
  }
  if(a==="adm_add"){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    await setSession(userId,"add_admin","telegram_id",{});
    return send(chatId,"أرسل Telegram User ID للمشرف الجديد.");
  }
  if(a.startsWith("adm|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id]=a.split("|");return sendAdminItem(chatId,admin,Number(id));
  }
  if(a.startsWith("adm_roles|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id]=a.split("|");return sendAdminRoles(chatId,admin,Number(id));
  }
  if(a.startsWith("adm_role|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id,role]=a.split("|");
    const targetId=Number(id);
    const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
    if(!t||!canManageAdmin(admin,t as Admin,role))return send(chatId,"غير مسموح بتغيير هذا الدور.");
    if(role==="owner")return send(chatId,"لا يمكن تعيين Owner جديد.");
    const allowed=["secondary_admin","content_manager","requests_manager","user_manager","viewer","moderator","support"];
    if(!allowed.includes(role))return send(chatId,"الدور غير صالح.");
    if(role==="secondary_admin"&&admin.role!=="owner")return send(chatId,"فقط المالك يستطيع تعيين أدمن ثانوي.");
    const {error}=await db.from("admin_users").update({role,permissions:{},updated_at:new Date().toISOString()}).eq("telegram_user_id",targetId);
    if(error)throw error;
    await adminLog(userId,"admin_role_change","admin",undefined,String(targetId),{from:t.role,to:role});
    return sendAdminItem(chatId,admin,targetId);
  }
  if(a.startsWith("adm_perms|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id]=a.split("|");return sendAdminPermissions(chatId,admin,Number(id));
  }
  if(a.startsWith("admp_reset|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id]=a.split("|");const targetId=Number(id);
    const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
    if(!t||!canManageAdmin(admin,t as Admin)||["owner","secondary_admin"].includes(t.role))return send(chatId,"غير مسموح.");
    const {error}=await db.from("admin_users").update({permissions:{},updated_at:new Date().toISOString()}).eq("telegram_user_id",targetId);if(error)throw error;
    await adminLog(userId,"admin_permissions_reset","admin",undefined,String(targetId),{});
    return sendAdminPermissions(chatId,admin,targetId);
  }
  if(a.startsWith("admp|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id,perm,value]=a.split("|");const targetId=Number(id);
    if(!(perm in permissionLabels)||perm==="admins")return send(chatId,"هذه الصلاحية محجوزة للأدمن الأساسي والثانوي.");
    const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
    if(!t||!canManageAdmin(admin,t as Admin)||["owner","secondary_admin"].includes(t.role))return send(chatId,"غير مسموح.");
    const permissions={...(t.permissions||{}),[perm]:value==="1"};
    const {error}=await db.from("admin_users").update({permissions,updated_at:new Date().toISOString()}).eq("telegram_user_id",targetId);if(error)throw error;
    await adminLog(userId,"admin_permission_change","admin",undefined,String(targetId),{permission:perm,value:value==="1"});
    return sendAdminPermissions(chatId,admin,targetId);
  }
  if(a.startsWith("adm_active|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id,value]=a.split("|");const targetId=Number(id);
    const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
    if(!t||targetId===userId||!canManageAdmin(admin,t as Admin)||t.role==="owner")return send(chatId,"لا يمكن تغيير حالة هذا الحساب.");
    const active=value==="1";
    const {error}=await db.from("admin_users").update({is_active:active,updated_at:new Date().toISOString()}).eq("telegram_user_id",targetId);if(error)throw error;
    await db.from("bot_sessions").delete().eq("telegram_user_id",targetId);
    await adminLog(userId,active?"admin_enable":"admin_disable","admin",undefined,String(targetId),{});
    return sendAdminItem(chatId,admin,targetId);
  }
  if(a.startsWith("adm_del1|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id]=a.split("|");const targetId=Number(id);
    const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
    if(!t||targetId===userId||!canManageAdmin(admin,t as Admin)||t.role==="owner")return send(chatId,"لا يمكن حذف هذا الحساب.");
    return send(chatId,`تأكيد حذف المشرف ${t.display_name||targetId}؟`,{inline_keyboard:[
      [{text:"تأكيد الحذف",callback_data:`adm_del2|${targetId}`}],
      [{text:"تراجع",callback_data:`adm|${targetId}`}],
    ]});
  }
  if(a.startsWith("adm_del2|")){
    if(!can(admin,"admins"))return send(chatId,"لا تملك صلاحية إدارة المشرفين.");
    const [,id]=a.split("|");const targetId=Number(id);
    const {data:t}=await db.from("admin_users").select("telegram_user_id,display_name,role,permissions,is_active").eq("telegram_user_id",targetId).maybeSingle();
    if(!t||targetId===userId||!canManageAdmin(admin,t as Admin)||t.role==="owner")return send(chatId,"لا يمكن حذف هذا الحساب.");
    await db.from("bot_sessions").delete().eq("telegram_user_id",targetId);
    const {error}=await db.from("admin_users").delete().eq("telegram_user_id",targetId);if(error)throw error;
    await adminLog(userId,"admin_delete","admin",undefined,String(targetId),{role:t.role,display_name:t.display_name});
    return sendAdminsManager(chatId,admin);
  }

  if(a==="stats"){
    if(!can(admin,"stats"))return send(chatId,"لا تملك صلاحية الإحصائيات.");
    const [m,sr,e,r,p,u,du,topM,topS]=await Promise.all([
      db.from("movies").select("id",{head:true,count:"exact"}),
      db.from("series").select("id",{head:true,count:"exact"}),
      db.from("episodes").select("id",{head:true,count:"exact"}),
      db.from("content_requests").select("id",{head:true,count:"exact"}).eq("status","new"),
      db.from("reports").select("id",{head:true,count:"exact"}).eq("status","new"),
      db.from("profiles").select("id",{head:true,count:"exact"}),
      db.from("profiles").select("id",{head:true,count:"exact"}).eq("is_disabled",true),
      db.from("movies").select("public_id,title,view_count").eq("status","published").order("view_count",{ascending:false}).limit(3),
      db.from("series").select("public_id,title,view_count").eq("status","published").order("view_count",{ascending:false}).limit(3),
    ]);
    const topMovies=(topM.data??[]).map((x:any)=>`• ${x.title}: ${x.view_count||0}`).join("\n")||"—";
    const topSeries=(topS.data??[]).map((x:any)=>`• ${x.title}: ${x.view_count||0}`).join("\n")||"—";
    return showMenu(chatId,`إحصائيات VAYZEN\n\nالأفلام: ${m.count||0}\nالمسلسلات: ${sr.count||0}\nالحلقات: ${e.count||0}\nالمستخدمون: ${u.count||0}\nالحسابات المعطلة: ${du.count||0}\nطلبات جديدة: ${r.count||0}\nبلاغات جديدة: ${p.count||0}\n\nأكثر الأفلام مشاهدة:\n${topMovies}\n\nأكثر المسلسلات مشاهدة:\n${topSeries}`);
  }
  if(a==="system_status"){
    if(!can(admin,"system"))return send(chatId,"لا تملك صلاحية مراقبة النظام.");
    return showMenu(chatId,await systemStatusText());
  }
  if(a==="users"){
    if(!can(admin,"users"))return send(chatId,"لا تملك صلاحية إدارة المستخدمين.");
    return sendUsersManager(chatId);
  }
  if(a==="user_search"){
    if(!can(admin,"users"))return send(chatId,"لا تملك صلاحية إدارة المستخدمين.");
    await setSession(userId,"search_user","query",{});
    return send(chatId,"أرسل الاسم أو البريد الإلكتروني للبحث.");
  }
  if(a.startsWith("usr|")){
    if(!can(admin,"users"))return send(chatId,"لا تملك صلاحية إدارة المستخدمين.");
    const [,id]=a.split("|");return sendUserItem(chatId,id);
  }
  if(a.startsWith("usb|")){
    if(!can(admin,"users"))return send(chatId,"لا تملك صلاحية إدارة المستخدمين.");
    const [,id,value]=a.split("|");
    const disabled=value==="1";
    const {error}=await db.from("profiles").update({is_disabled:disabled,updated_at:new Date().toISOString()}).eq("id",id);
    if(error)throw error;
    await adminLog(userId,disabled?"user_disable":"user_enable","user",id,undefined,{});
    return sendUserItem(chatId,id);
  }

  if(a==="requests"){
    if(!can(admin,"requests")) return send(chatId,"لا تملك صلاحية الطلبات.");
    return sendRequestsManager(chatId);
  }
  if(a.startsWith("rql|")){
    if(!can(admin,"requests"))return send(chatId,"لا تملك صلاحية الطلبات.");
    const [,code]=a.split("|");
    await setSession(userId,"link_request","content_id",{request_code:code});
    return send(chatId,`أرسل Movie ID أو Series ID للمحتوى الذي يحقق الطلب ${code}.\nمثال: MOV-000004 أو SER-000001`);
  }
  if(a.startsWith("rq|")){
    if(!can(admin,"requests"))return send(chatId,"لا تملك صلاحية الطلبات.");
    const [,code,status]=a.split("|");
    if(!["reviewing","rejected","duplicate"].includes(status))return sendRequestsManager(chatId);
    const {error}=await db.from("content_requests").update({
      status,handled_by:userId,
      ...(status!=="reviewing"?{linked_entity_type:null,linked_entity_id:null}:{}),
      updated_at:new Date().toISOString()
    }).eq("request_code",code);
    if(error)throw error;
    await adminLog(userId,"request_status","request",undefined,code,{status});
    return sendRequestsManager(chatId);
  }

  if(a==="reports"){
    if(!can(admin,"reports")) return send(chatId,"لا تملك صلاحية البلاغات.");
    return sendReportsManager(chatId);
  }
  if(a.startsWith("rp|")){
    if(!can(admin,"reports"))return send(chatId,"لا تملك صلاحية البلاغات.");
    const [,code,status]=a.split("|");
    if(!["reviewing","resolved","rejected"].includes(status))return sendReportsManager(chatId);
    const {error}=await db.from("reports").update({status,handled_by:userId,updated_at:new Date().toISOString()}).eq("report_code",code);
    if(error)throw error;
    await adminLog(userId,"report_status","report",undefined,code,{status});
    return sendReportsManager(chatId);
  }
  return showMenu(chatId);
}

async function message(m:any){
  const chatId=Number(m.chat?.id||0);
  const userId=Number(m.from?.id||0);
  if(!chatId||!userId) return;
  const admin=await getAdmin(userId);
  if(!admin) return send(chatId,"هذا البوت مخصص لإدارة VAYZEN.");
  const text=String(m.text??"").trim();
  const caption=String(m.caption??"").trim();

  if(text==="/start"||text==="/menu"){
    await clearSession(userId);
    return showMenu(chatId);
  }

  const s=await getSession(userId);
  if(!s) return showMenu(chatId);
  const d:any={...(s.draft??{})};

  if(s.flow==="tmdb_settings"&&s.step==="token"){
    if(admin.role!=="owner"){await clearSession(userId);return send(chatId,"إعدادات TMDb متاحة للمالك فقط.");}
    const token=text.trim();
    try{await tg("deleteMessage",{chat_id:chatId,message_id:m.message_id});}catch{}
    if(!token)return send(chatId,"أرسل Access Token كنص.");
    try{
      const saved=await saveTmdbAccessToken(token);
      await clearSession(userId);
      await adminLog(userId,"tmdb_connect","settings",undefined,"tmdb",{token_hint:saved.token_hint});
      return sendTmdbSettings(chatId);
    }catch(err){
      return send(chatId,`لم يتم حفظ التوكن لأن الاختبار فشل.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"إعادة المحاولة",callback_data:"tmdb_token_set"},{text:"إلغاء",callback_data:"tmdb_settings"}]]});
    }
  }

  if(s.flow==="tmdb_search"&&(s.step==="query"||s.step==="results")){
    if(!can(admin,"content")||!can(admin,"publish")){await clearSession(userId);return send(chatId,"لا تملك صلاحية إضافة المحتوى.");}
    const type=String(d.type||"")==="series"?"series":"movie";
    const q=text.trim().slice(0,120);
    if(q.length<2)return send(chatId,"اكتب اسمًا من حرفين على الأقل.");
    try{
      await setSession(userId,"tmdb_search","results",{type,query:q});
      return sendTmdbSearchResults(chatId,type,q);
    }catch(err){
      return send(chatId,`فشل البحث في TMDb.\n${adminErrorText(err)}`,{inline_keyboard:[[{text:"بحث جديد",callback_data:`tmdb_again|${type==="movie"?"m":"s"}`},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }

  if(s.flow==="add_admin"){
    if(!can(admin,"admins")){await clearSession(userId);return send(chatId,"لا تملك صلاحية إدارة المشرفين.");}
    if(s.step==="telegram_id"){
      const id=Number(text);
      if(!Number.isInteger(id)||id<=0)return send(chatId,"Telegram User ID غير صحيح. أرسل الرقم فقط.");
      const {data:exists}=await db.from("admin_users").select("telegram_user_id").eq("telegram_user_id",id).maybeSingle();
      if(exists)return send(chatId,"هذا الحساب موجود ضمن الإدارة بالفعل.");
      d.telegram_id=id;await setSession(userId,"add_admin","name",d);
      return send(chatId,"أرسل اسم المشرف الذي سيظهر في لوحة الإدارة.");
    }
    if(s.step==="name"){
      const name=text.trim().slice(0,60);if(name.length<2)return send(chatId,"الاسم قصير جدًا.");
      d.display_name=name;await setSession(userId,"add_admin","role",d);
      const roles:any[]=[];
      if(admin.role==="owner")roles.push([{text:"أدمن ثانوي",callback_data:"adm_new_role|secondary_admin"}]);
      roles.push([{text:"مشرف محتوى",callback_data:"adm_new_role|content_manager"},{text:"مشرف طلبات",callback_data:"adm_new_role|requests_manager"}]);
      roles.push([{text:"مشرف مستخدمين",callback_data:"adm_new_role|user_manager"},{text:"مراقب",callback_data:"adm_new_role|viewer"}]);
      roles.push([{text:"مشرف",callback_data:"adm_new_role|moderator"},{text:"دعم",callback_data:"adm_new_role|support"}]);
      roles.push([{text:"إلغاء",callback_data:"cancel"}]);
      return send(chatId,`اختر دور ${name}:`,{inline_keyboard:roles});
    }
    if(s.step==="role")return send(chatId,"اختر الدور من الأزرار الظاهرة.");
  }

  if(s.flow==="batch_episode"){
    if(!can(admin,"content")||!can(admin,"publish")){await clearSession(userId);return send(chatId,"لا تملك صلاحية النشر.");}
    if(s.step==="season"){
      const n=Number(text);if(!Number.isInteger(n)||n<1||n>999)return send(chatId,"رقم الموسم غير صحيح.");
      d.season_number=n;await setSession(userId,"batch_episode","start",d);
      return send(chatId,`الموسم ${n}\nأرسل رقم أول حلقة، مثال: 1`);
    }
    if(s.step==="start"){
      const n=Number(text);if(!Number.isInteger(n)||n<1||n>9999)return send(chatId,"رقم الحلقة غير صحيح.");
      d.next_episode=n;d.items=Array.isArray(d.items)?d.items:[];
      await setSession(userId,"batch_episode","receiving",d);
      return send(chatId,`بدأ الاستقبال من الحلقة ${n}.\n\nأرسل الفيديوهات بالترتيب. بدون Caption: كل فيديو = الحلقة التالية.\nوللتحديد اليدوي استخدم:\nE03 | 1080p\nأو\nE03 | اسم الحلقة | 1080p`,{inline_keyboard:[[{text:"إنهاء ومراجعة",callback_data:"batch_finish"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
    if(s.step==="receiving"){
      const file=videoFrom(m);if(!file)return send(chatId,"أرسل ملف فيديو، أو اضغط إنهاء ومراجعة.");
      if(file.file_size&&file.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 800MB.");
      const items:any[]=Array.isArray(d.items)?d.items:[];
      if(items.length>=120)return send(chatId,"وصلت إلى 120 ملفًا في هذه الدفعة. اضغط إنهاء ومراجعة ثم ابدأ دفعة جديدة.",{inline_keyboard:[[{text:"إنهاء ومراجعة",callback_data:"batch_finish"}]]});
      const parsed=parseBatchEpisodeCaption(caption,Number(d.next_episode||1));
      if(parsed.variant==="default"){
        const fn=String(file.file_name||"").toLowerCase();const qm=fn.match(/(?:^|[^0-9])(360p|480p|540p|720p|1080p|1440p|2160p|4k)(?:[^0-9]|$)/i);
        if(qm)parsed.variant=normalizeVariant(qm[1]);
      }
      if(items.some((x:any)=>Number(x.episode_number)===parsed.episode_number&&normalizeVariant(x.variant)===parsed.variant)){
        return send(chatId,`E${parsed.episode_number} بجودة ${variantLabel(parsed.variant)} موجودة داخل الدفعة بالفعل.`);
      }
      items.push({episode_number:parsed.episode_number,title:parsed.title,variant:parsed.variant,file,source_message_id:m.message_id});
      d.items=items;
      if(!parsed.explicitEpisode)d.next_episode=parsed.episode_number+1;
      else if(parsed.episode_number>=Number(d.next_episode||1))d.next_episode=parsed.episode_number+1;
      await setSession(userId,"batch_episode","receiving",d);
      const episodes=new Set(items.map((x:any)=>Number(x.episode_number))).size;
      return send(chatId,`تم استلام E${String(parsed.episode_number).padStart(2,"0")} • ${variantLabel(parsed.variant)}\nالحلقات: ${episodes} • الملفات: ${items.length} • التالي: E${String(d.next_episode).padStart(2,"0")}`,{inline_keyboard:[[{text:"إنهاء ومراجعة",callback_data:"batch_finish"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
    if(s.step==="confirm")return send(chatId,batchEpisodeSummary(d),{inline_keyboard:[[{text:"نشر الكل",callback_data:"confirm_batch_episode"},{text:"متابعة الإضافة",callback_data:"batch_resume"}],[{text:"إلغاء",callback_data:"cancel"}]]});
    if(s.step==="publishing")return send(chatId,"النشر الجماعي قيد التنفيذ.");
  }

  if(s.flow==="search_user"&&s.step==="query"){
    await clearSession(userId);
    return searchUsers(chatId,text);
  }

  if(s.flow==="search_content"&&s.step==="query"){
    const type=String(d.type||"");
    await clearSession(userId);
    return searchContent(chatId,text,type||undefined);
  }

  if(s.flow==="edit_season"&&s.step==="title"){
    const series:any=await contentByPublicId("series",String(d.series_public_id||""));
    if(!series){await clearSession(userId);return send(chatId,"المسلسل غير موجود.");}
    const title=text.trim().slice(0,120);if(!title)return send(chatId,"اسم الموسم لا يمكن أن يكون فارغًا.");
    const {error}=await db.from("seasons").update({title,updated_at:new Date().toISOString()}).eq("series_id",series.id).eq("season_number",Number(d.season_number));
    if(error)throw error;
    await adminLog(userId,"season_edit","series",series.id,series.public_id,{season_number:Number(d.season_number)});
    await clearSession(userId);
    return sendSeasonEpisodes(chatId,series.public_id,Number(d.season_number));
  }

  if(s.flow==="add_quality"&&s.step==="label"){
    const raw=text.trim().toLowerCase().replace(/\s+/g,"");
    const variant=normalizeVariant(raw);
    if(variant==="default"&&raw!=="default")return send(chatId,"اسم الجودة غير صالح. استخدم مثل 480p أو 720p أو 1080p أو 4K.");
    d.variant=variant;
    await setSession(userId,"add_quality","file",d);
    return send(chatId,`أرسل فيديو جودة ${variantLabel(variant)}. الحد الأقصى 800MB.`);
  }
  if(s.flow==="add_quality"&&s.step==="file"){
    const target:any=await qualityTarget(String(d.type||""),String(d.public_id||""));
    if(!target){await clearSession(userId);return send(chatId,"المحتوى غير موجود.");}
    const file=videoFrom(m);if(!file)return send(chatId,"أرسل ملف فيديو.");
    if(file.file_size&&file.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 800MB.");
    const variant=normalizeVariant(d.variant);
    const title=target.item.title||target.item.series?.title||target.item.public_id;
    await replaceStoredAsset({
      adminId:userId,chatId,entityType:target.entityType,entityId:target.item.id,publicId:String(d.public_id),
      kind:"video",channelKey:target.channelKey,sourceMessageId:m.message_id,file,variant,
      caption:`${d.public_id} | ${title} | ${variantLabel(variant)} | ${sizeLabel(file.file_size)}`
    });
    await clearSession(userId);
    return sendQualityManager(chatId,String(d.type),String(d.public_id));
  }

  if(s.flow==="replace_quality"&&s.step==="file"){
    const target:any=await qualityTarget(String(d.type||""),String(d.public_id||""));
    if(!target){await clearSession(userId);return send(chatId,"المحتوى غير موجود.");}
    const file=videoFrom(m);if(!file)return send(chatId,"أرسل ملف فيديو.");
    if(file.file_size&&file.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 800MB.");
    const variant=normalizeVariant(d.variant);
    const title=target.item.title||target.item.series?.title||target.item.public_id;
    await replaceStoredAsset({
      adminId:userId,chatId,entityType:target.entityType,entityId:target.item.id,publicId:String(d.public_id),
      kind:"video",channelKey:target.channelKey,sourceMessageId:m.message_id,file,variant,
      caption:`${d.public_id} | ${title} | ${variantLabel(variant)} | ${sizeLabel(file.file_size)}`
    });
    await clearSession(userId);
    return sendQualityManager(chatId,String(d.type),String(d.public_id));
  }

  if(s.flow==="edit_content"&&s.step==="value"){
    const type=String(d.type||""),publicId=String(d.public_id||""),field=String(d.field||"");
    const item:any=await contentByPublicId(type,publicId);
    if(!item){await clearSession(userId);return send(chatId,"المحتوى غير موجود.");}
    let value:any=text;
    if(field==="title"){
      value=text.trim().slice(0,200);if(!value)return send(chatId,"الاسم لا يمكن أن يكون فارغًا.");
    }else if(field==="description"){
      value=text==="-"?"":text.slice(0,4000);
    }else if(field==="release_year"){
      value=yearOf(text);if(!value)return send(chatId,"السنة غير صحيحة.");
    }else if(field==="genres"){
      value=splitGenres(text);
    }else if(["language","country","quality"].includes(field)){
      value=text==="-"?"":text.slice(0,120);
    }else if(field==="duration_minutes"){
      value=positiveOrNull(text);if(text!=="-"&&!value)return send(chatId,"أرسل رقمًا صحيحًا أو -.");
    }else{
      await clearSession(userId);return send(chatId,"الحقل غير مدعوم.");
    }
    const table=type==="movie"?"movies":"series";
    const {error}=await db.from(table).update({[field]:value,updated_at:new Date().toISOString()}).eq("id",item.id);
    if(error)throw error;
    await adminLog(userId,"content_edit",type,item.id,item.public_id,{field});
    await clearSession(userId);
    return sendContentItem(chatId,type,item.public_id);
  }

  if(s.flow==="replace_poster"&&s.step==="file"){
    const type=String(d.type||""),publicId=String(d.public_id||"");
    const item:any=await contentByPublicId(type,publicId);
    if(!item){await clearSession(userId);return send(chatId,"المحتوى غير موجود.");}
    const file=photoFrom(m);if(!file)return send(chatId,"أرسل صورة بوستر.");
    await replaceStoredAsset({
      adminId:userId,chatId,entityType:type as "movie"|"series",entityId:item.id,publicId:item.public_id,
      kind:"poster",channelKey:type==="movie"?"movies_info":"series_info",
      sourceMessageId:m.message_id,file,caption:`${item.public_id} | ${item.title} | Poster`
    });
    await clearSession(userId);
    return sendContentItem(chatId,type,item.public_id);
  }

  if(s.flow==="replace_movie_video"&&s.step==="file"){
    const item:any=await contentByPublicId("movie",String(d.public_id||""));
    if(!item){await clearSession(userId);return send(chatId,"الفيلم غير موجود.");}
    const file=videoFrom(m);if(!file)return send(chatId,"أرسل ملف فيديو.");
    if(file.file_size&&file.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 800MB.");
    await replaceStoredAsset({
      adminId:userId,chatId,entityType:"movie",entityId:item.id,publicId:item.public_id,
      kind:"video",channelKey:"movies_storage",sourceMessageId:m.message_id,file,
      caption:`${item.public_id} | ${item.title} | ${item.quality||"Video"} | ${sizeLabel(file.file_size)}`
    });
    await clearSession(userId);
    return sendContentItem(chatId,"movie",item.public_id);
  }

  if(s.flow==="edit_episode"&&s.step==="value"){
    const ep:any=await episodeByPublicId(String(d.public_id||""));
    if(!ep){await clearSession(userId);return send(chatId,"الحلقة غير موجودة.");}
    const field=String(d.field||"");
    if(!["title","description","quality"].includes(field)){await clearSession(userId);return sendEpisodeItem(chatId,ep.public_id);}
    let value=text;
    if(field==="title"){value=text.trim().slice(0,200);if(!value)return send(chatId,"اسم الحلقة لا يمكن أن يكون فارغًا.");}
    if(field==="description")value=text==="-"?"":text.slice(0,4000);
    if(field==="quality")value=text==="-"?"":text.slice(0,120);
    const {error}=await db.from("episodes").update({[field]:value,updated_at:new Date().toISOString()}).eq("id",ep.id);
    if(error)throw error;
    await adminLog(userId,"episode_edit","episode",ep.id,ep.public_id,{field});
    await clearSession(userId);
    return sendEpisodeItem(chatId,ep.public_id);
  }

  if(s.flow==="replace_episode_video"&&s.step==="file"){
    const ep:any=await episodeByPublicId(String(d.public_id||""));
    if(!ep){await clearSession(userId);return send(chatId,"الحلقة غير موجودة.");}
    const file=videoFrom(m);if(!file)return send(chatId,"أرسل ملف فيديو.");
    if(file.file_size&&file.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 800MB.");
    await replaceStoredAsset({
      adminId:userId,chatId,entityType:"episode",entityId:ep.id,publicId:ep.public_id,
      kind:"video",channelKey:"series_storage",sourceMessageId:m.message_id,file,
      caption:`${ep.public_id} | ${ep.series?.title||"Series"} | موسم ${ep.season?.season_number||"—"} | حلقة ${ep.episode_number} | ${ep.quality||"Video"}`
    });
    await clearSession(userId);
    return sendEpisodeItem(chatId,ep.public_id);
  }

  if(s.flow==="link_request"&&s.step==="content_id"){
    const code=String(d.request_code||"");
    const id=text.toUpperCase();
    const type=/^MOV-\d{6}$/.test(id)?"movie":/^SER-\d{6}$/.test(id)?"series":"";
    if(!type)return send(chatId,"ID غير صحيح. أرسل MOV-000000 أو SER-000000.");
    const item:any=await contentByPublicId(type,id);
    if(!item||item.status!=="published")return send(chatId,"المحتوى غير موجود أو غير منشور.");
    const {error}=await db.from("content_requests").update({
      status:"added",linked_entity_type:type,linked_entity_id:item.id,handled_by:userId,updated_at:new Date().toISOString()
    }).eq("request_code",code);
    if(error)throw error;
    await adminLog(userId,"request_link","request",item.id,code,{content_public_id:item.public_id,type});
    await clearSession(userId);
    return sendRequestsManager(chatId);
  }

  if(s.flow==="movie"){
    if(s.step==="title"){if(!text)return send(chatId,"أرسل الاسم.");d.title=text;await setSession(userId,"movie","original_title",d);return send(chatId,"أرسل الاسم الأصلي، أو - للتخطي.");}
    if(s.step==="original_title"){d.original_title=text==="-"?"":text;await setSession(userId,"movie","description",d);return send(chatId,"أرسل وصف الفيلم، أو - للتخطي.");}
    if(s.step==="description"){d.description=text==="-"?"":text;await setSession(userId,"movie","year",d);return send(chatId,"أرسل سنة الإصدار.");}
    if(s.step==="year"){const y=yearOf(text);if(!y)return send(chatId,"السنة غير صحيحة.");d.release_year=y;await setSession(userId,"movie","genres",d);return send(chatId,"أرسل التصنيفات، مثال: أكشن، خيال علمي.");}
    if(s.step==="genres"){d.genres=splitGenres(text);await setSession(userId,"movie","language",d);return send(chatId,"أرسل اللغة.");}
    if(s.step==="language"){d.language=text;await setSession(userId,"movie","country",d);return send(chatId,"أرسل الدولة، أو - للتخطي.");}
    if(s.step==="country"){d.country=text==="-"?"":text;await setSession(userId,"movie","duration",d);return send(chatId,"أرسل مدة الفيلم بالدقائق، أو - للتخطي.");}
    if(s.step==="duration"){const n=positiveOrNull(text);if(text!=="-"&&!n)return send(chatId,"أرسل رقمًا صحيحًا أو -.");d.duration_minutes=n;await setSession(userId,"movie","quality",d);return send(chatId,"أرسل الجودة، مثال 1080p.");}
    if(s.step==="quality"){
      d.quality=text;
      if(d.poster){await setSession(userId,"movie","video",d);return send(chatId,`أرسل فيديو جودة ${variantLabel(normalizeVariant(text))}. الحد الحالي 800MB.`);}
      await setSession(userId,"movie","poster",d);return send(chatId,"أرسل بوستر الفيلم.");
    }
    if(s.step==="poster"){
      const f=photoFrom(m);if(!f)return send(chatId,"أرسل صورة البوستر.");
      d.poster=f;d.poster_source_message_id=m.message_id;
      if(d.tmdb_imported&&!d.quality){await setSession(userId,"movie","quality",d);return send(chatId,"أرسل جودة أول فيديو، مثال 1080p.");}
      await setSession(userId,"movie","video",d);return send(chatId,"أرسل فيديو الفيلم. الحد الحالي 800MB.");
    }
    if(s.step==="video"){
      const f=videoFrom(m);if(!f)return send(chatId,"أرسل ملف فيديو.");
      if(f.file_size&&f.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 800MB.");
      const variant=normalizeVariant(d.pending_quality||d.quality||"default");
      const videos=Array.isArray(d.videos)?d.videos:[];
      if(videos.some((x:any)=>normalizeVariant(x.variant)===variant))return send(chatId,`جودة ${variantLabel(variant)} موجودة مسبقًا. اختر جودة أخرى.`);
      videos.push({variant,file:f,source_message_id:m.message_id});
      d.videos=videos;delete d.pending_quality;delete d.video;delete d.video_source_message_id;
      await setSession(userId,"movie","video_review",d);
      return send(chatId,movieSummary(d),{inline_keyboard:[
        [{text:"إضافة جودة أخرى",callback_data:"movie_add_quality"},{text:"نشر الفيلم",callback_data:"confirm_movie"}],
        [{text:"إلغاء",callback_data:"cancel"}]
      ]});
    }
    if(s.step==="quality_extra"){
      const raw=text.trim().toLowerCase().replace(/\s+/g,"");
      const variant=normalizeVariant(raw);
      if(variant==="default"&&raw!=="default")return send(chatId,"الجودة غير صالحة. مثال: 480p أو 720p أو 1080p أو 4K.");
      const videos=Array.isArray(d.videos)?d.videos:[];
      if(videos.some((x:any)=>normalizeVariant(x.variant)===variant))return send(chatId,"هذه الجودة موجودة مسبقًا.");
      d.pending_quality=variant;
      await setSession(userId,"movie","video",d);
      return send(chatId,`أرسل فيديو جودة ${variantLabel(variant)}. الحد 800MB.`);
    }
  }

  if(s.flow==="series"){
    if(s.step==="title"){if(!text)return send(chatId,"أرسل الاسم.");d.title=text;await setSession(userId,"series","original_title",d);return send(chatId,"أرسل الاسم الأصلي، أو - للتخطي.");}
    if(s.step==="original_title"){d.original_title=text==="-"?"":text;await setSession(userId,"series","description",d);return send(chatId,"أرسل وصف المسلسل، أو - للتخطي.");}
    if(s.step==="description"){d.description=text==="-"?"":text;await setSession(userId,"series","year",d);return send(chatId,"أرسل سنة الإصدار.");}
    if(s.step==="year"){const y=yearOf(text);if(!y)return send(chatId,"السنة غير صحيحة.");d.release_year=y;await setSession(userId,"series","genres",d);return send(chatId,"أرسل التصنيفات.");}
    if(s.step==="genres"){d.genres=splitGenres(text);await setSession(userId,"series","language",d);return send(chatId,"أرسل اللغة.");}
    if(s.step==="language"){d.language=text;await setSession(userId,"series","country",d);return send(chatId,"أرسل الدولة، أو - للتخطي.");}
    if(s.step==="country"){d.country=text==="-"?"":text;await setSession(userId,"series","quality",d);return send(chatId,"أرسل الجودة.");}
    if(s.step==="quality"){d.quality=text;await setSession(userId,"series","poster",d);return send(chatId,"أرسل بوستر المسلسل.");}
    if(s.step==="poster"){
      const f=photoFrom(m);if(!f)return send(chatId,"أرسل صورة البوستر.");
      d.poster=f;d.poster_source_message_id=m.message_id;
      await setSession(userId,"series","confirm",d);
      const buttons=d.external_source==="tmdb"
        ?[[{text:"نشر المعلومات فقط",callback_data:"confirm_series"},{text:"استيراد المواسم والحلقات",callback_data:"confirm_series_tmdb_all"}],[{text:"إلغاء",callback_data:"cancel"}]]
        :[[{text:"نشر المسلسل",callback_data:"confirm_series"},{text:"نشر ثم إضافة حلقات",callback_data:"confirm_series_batch"}],[{text:"إلغاء",callback_data:"cancel"}]];
      return send(chatId,seriesSummary(d),{inline_keyboard:buttons});
    }
  }

  if(s.flow==="episode"){
    if(s.step==="series_id"){if(!/^SER-\d{6}$/i.test(text))return send(chatId,"Series ID غير صحيح.");d.series_public_id=text.toUpperCase();await setSession(userId,"episode","season",d);return send(chatId,"أرسل رقم الموسم.");}
    if(s.step==="season"){const n=Number(text);if(!Number.isInteger(n)||n<1)return send(chatId,"رقم الموسم غير صحيح.");d.season_number=n;await setSession(userId,"episode","episode",d);return send(chatId,"أرسل رقم الحلقة.");}
    if(s.step==="episode"){const n=Number(text);if(!Number.isInteger(n)||n<1)return send(chatId,"رقم الحلقة غير صحيح.");d.episode_number=n;await setSession(userId,"episode","title",d);return send(chatId,"أرسل اسم الحلقة، أو - للاسم التلقائي.");}
    if(s.step==="title"){d.title=text==="-"?`الحلقة ${d.episode_number}`:text;await setSession(userId,"episode","description",d);return send(chatId,"أرسل وصف الحلقة، أو - للتخطي.");}
    if(s.step==="description"){d.description=text==="-"?"":text;await setSession(userId,"episode","quality",d);return send(chatId,"أرسل الجودة.");}
    if(s.step==="quality"){d.quality=text;await setSession(userId,"episode","video",d);return send(chatId,"أرسل فيديو الحلقة. الحد 800MB.");}
    if(s.step==="video"){
      const f=videoFrom(m);if(!f)return send(chatId,"أرسل ملف فيديو.");
      if(f.file_size&&f.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 800MB.");
      d.video=f;d.video_source_message_id=m.message_id;
      await setSession(userId,"episode","confirm",d);
      return send(chatId,`معاينة الحلقة:\n${d.series_public_id}\nالموسم: ${d.season_number}\nالحلقة: ${d.episode_number}\nالعنوان: ${d.title}\nالجودة: ${d.quality}\nالحجم: ${sizeLabel(f.file_size)}`,{inline_keyboard:[[{text:"نشر الحلقة",callback_data:"confirm_episode"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }
  return showMenu(chatId);
}

function qualityRank(v:string){
  const x=normalizeVariant(v);
  if(x==="4k")return 4000;
  const m=x.match(/^(\d{3,4})p$/);
  return m?Number(m[1]):(x==="default"?1:0);
}
async function asset(type:string,id:string,variant="default"){
  if(!/^[0-9a-f-]{36}$/i.test(id)) return null;
  let entity_type="",kind="";
  if(type==="movie_poster"||type==="movie_video"||type==="movie_backdrop"){
    const {data}=await db.from("movies").select("status").eq("id",id).maybeSingle();
    if(data?.status!=="published") return null;
    entity_type="movie";kind=type==="movie_poster"?"poster":type==="movie_backdrop"?"backdrop":"video";
  }else if(type==="series_poster"||type==="series_backdrop"){
    const {data}=await db.from("series").select("status").eq("id",id).maybeSingle();
    if(data?.status!=="published") return null;
    entity_type="series";kind=type==="series_backdrop"?"backdrop":"poster";
  }else if(type==="episode_video"){
    const {data:e}=await db.from("episodes").select("season_id,status").eq("id",id).maybeSingle();
    if(e?.status!=="published") return null;
    const {data:se}=await db.from("seasons").select("series_id,status").eq("id",e.season_id).maybeSingle();
    if(se?.status!=="published") return null;
    const {data:sr}=await db.from("series").select("status").eq("id",se.series_id).maybeSingle();
    if(sr?.status!=="published") return null;
    entity_type="episode";kind="video";
  }else return null;

  const requested=kind==="video"?normalizeVariant(variant):"default";
  const {data:direct}=await db.from("media_assets")
    .select("channel_id,channel_message_id,telegram_file_id,mime_type,file_size,variant")
    .eq("entity_type",entity_type).eq("entity_id",id).eq("kind",kind).eq("variant",requested).maybeSingle();
  if(direct)return direct;
  if(kind==="backdrop"){
    const {data:fallback}=await db.from("media_assets")
      .select("channel_id,channel_message_id,telegram_file_id,mime_type,file_size,variant")
      .eq("entity_type",entity_type).eq("entity_id",id).eq("kind","poster").eq("variant","default").maybeSingle();
    return fallback??null;
  }
  if(kind!=="video"||requested!=="default")return null;
  const {data:list}=await db.from("media_assets")
    .select("channel_id,channel_message_id,telegram_file_id,mime_type,file_size,variant")
    .eq("entity_type",entity_type).eq("entity_id",id).eq("kind","video");
  const sorted=(list??[]).sort((a:any,b:any)=>qualityRank(String(b.variant))-qualityRank(String(a.variant)));
  return sorted[0]??null;
}

async function publicMediaVariants(url:URL){
  const type=String(url.searchParams.get("type")||"");
  const id=String(url.searchParams.get("id")||"");
  if(!["movie","episode"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid media target"},400);
  const probe=await asset(type==="movie"?"movie_video":"episode_video",id,"default");
  if(!probe)return json({error:"not found"},404);
  const {data,error}=await db.from("media_assets")
    .select("variant,file_size,mime_type")
    .eq("entity_type",type).eq("entity_id",id).eq("kind","video");
  if(error)throw error;
  const variants=(data??[])
    .map((x:any)=>({variant:String(x.variant||"default"),label:variantLabel(String(x.variant||"default")),file_size:x.file_size||null,mime_type:x.mime_type||null}))
    .sort((a:any,b:any)=>qualityRank(b.variant)-qualityRank(a.variant));
  return json({ok:true,variants});
}

async function streamSigningSecret(){
  const {data}=await db.from("app_settings").select("value").eq("key","stream_signing").maybeSingle();
  const dbSecret=String((data as any)?.value?.secret||"");
  return dbSecret||STREAM_SIGNING_SECRET;
}

async function streamGateway(){
  const {data}=await db.from("app_settings").select("value").eq("key","stream_gateway").maybeSingle();
  const dbUrl=String((data as any)?.value?.url||"").replace(/\/$/,"");
  return dbUrl||STREAM_GATEWAY.replace(/\/$/,"");
}

async function hmacHex(payload:string,secret:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function media(type:string,id:string,req?:Request){
  const quality=req?new URL(req.url).searchParams.get("quality")||"default":"default";
  const a:any=await asset(type,id,quality);
  if(!a) return json({error:"not found"},404);
  if(type==="movie_video"||type==="episode_video"){
    const signingSecret=await streamSigningSecret();
    const gatewayBase=await streamGateway();
    if(!gatewayBase||!signingSecret) return json({error:"streaming gateway not configured"},503);
    if(a.file_size&&Number(a.file_size)>MAX_VIDEO_BYTES) return json({error:"file exceeds current 800MB limit"},413);
    const exp=Math.floor(Date.now()/1000)+600;
    const payload=`${a.channel_id}:${a.channel_message_id}:${exp}`;
    const sig=await hmacHex(payload,signingSecret);
    return Response.redirect(`${gatewayBase}/stream/${a.channel_id}/${a.channel_message_id}?exp=${exp}&sig=${sig}`,307);
  }
  if(!a.telegram_file_id) return json({error:"poster file id missing"},409);
  const file=await tg("getFile",{file_id:a.telegram_file_id});
  const upstream=await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
  const headers=new Headers(cors);
  headers.set("Content-Type",upstream.headers.get("content-type")||a.mime_type||"image/jpeg");
  headers.set("Cache-Control","public, max-age=3600");
  return new Response(upstream.body,{status:upstream.status,headers});
}


async function userFromRequest(req:Request){
  const auth=req.headers.get("authorization")||"";
  const token=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
  if(!token||!PUBLIC_KEY)return null;
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)return null;
  const {data:profile}=await db.from("profiles").select("is_disabled").eq("id",data.user.id).maybeSingle();
  if(profile?.is_disabled)return null;
  return {user:data.user,token};
}

async function authSignup(req:Request){
  const body=await req.json().catch(()=>null);
  const email=String(body?.email||"").trim();
  const password=String(body?.password||"");
  const displayName=String(body?.display_name||"").trim().slice(0,40);
  if(!PUBLIC_KEY||!email.includes("@")||password.length<8||displayName.length<2)return json({error:"invalid signup data"},400);
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:displayName}}});
  if(error)return json({error:error.message},400);
  return json({ok:true,user:data.user?{id:data.user.id,email:data.user.email}:null,session:data.session?{access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at}:null});
}

async function authLogin(req:Request){
  const body=await req.json().catch(()=>null);
  const email=String(body?.email||"").trim();
  const password=String(body?.password||"");
  if(!PUBLIC_KEY)return json({error:"auth unavailable"},503);
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error)return json({error:"بيانات الدخول غير صحيحة"},401);
  const {data:profile}=await db.from("profiles").select("is_disabled").eq("id",data.user.id).maybeSingle();
  if(profile?.is_disabled)return json({error:"هذا الحساب معطّل حاليًا"},403);
  return json({ok:true,user:{id:data.user.id,email:data.user.email},session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at}});
}

async function authRefresh(req:Request){
  const body=await req.json().catch(()=>null);
  const refreshToken=String(body?.refresh_token||"");
  if(!PUBLIC_KEY||!refreshToken)return json({error:"invalid refresh token"},400);
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.refreshSession({refresh_token:refreshToken});
  if(error||!data.session)return json({error:"session expired"},401);
  const {data:profile}=await db.from("profiles").select("is_disabled").eq("id",data.user?.id||"").maybeSingle();
  if(profile?.is_disabled)return json({error:"account disabled"},403);
  return json({ok:true,session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at}});
}

async function me(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  const {data:profile}=await db.from("profiles").select("display_name,avatar_url,created_at").eq("id",auth.user.id).maybeSingle();
  return json({ok:true,user:{id:auth.user.id,email:auth.user.email,display_name:profile?.display_name||"",avatar_url:profile?.avatar_url||"",created_at:profile?.created_at||auth.user.created_at}});
}

async function updateProfile(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  const body=await req.json().catch(()=>null);
  const name=String(body?.display_name||"").trim().slice(0,40);
  if(name.length<2)return json({error:"invalid name"},400);
  const {error}=await db.from("profiles").update({display_name:name,updated_at:new Date().toISOString()}).eq("id",auth.user.id);
  if(error)throw error;
  return json({ok:true,display_name:name});
}

async function changePassword(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  const body=await req.json().catch(()=>null);
  const current=String(body?.current_password||"");
  const next=String(body?.new_password||"");
  if(current.length<8||next.length<8)return json({error:"كلمة المرور يجب أن تكون 8 أحرف على الأقل"},400);
  if(current===next)return json({error:"اختر كلمة مرور جديدة مختلفة"},400);
  const email=String(auth.user.email||"");
  if(!email)return json({error:"لا يوجد بريد مرتبط بالحساب"},400);

  const verifier=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:verifyError}=await verifier.auth.signInWithPassword({email,password:current});
  if(verifyError)return json({error:"كلمة المرور الحالية غير صحيحة"},401);

  const {error:updateError}=await db.auth.admin.updateUserById(auth.user.id,{password:next});
  if(updateError)throw updateError;
  return json({ok:true});
}

async function recordView(req:Request){
  const body=await req.json().catch(()=>null);
  const type=String(body?.entity_type||"");
  const id=String(body?.entity_id||"");
  const viewer=String(body?.viewer_key||"").trim();
  if(!["movie","episode"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id)||!/^[A-Za-z0-9_-]{20,100}$/.test(viewer))return json({error:"invalid view"},400);
  const allowed=await consumeRateLimit(viewer+":"+type+":"+id,"view",1,15*60);
  if(!allowed)return json({ok:true,counted:false});
  const {error}=await db.rpc("bump_view_count",{p_entity_type:type,p_entity_id:id});
  if(error)throw error;
  return json({ok:true,counted:true});
}

async function catalog(){
  const [m,s]=await Promise.all([
    db.from("movies").select("id,public_id,title,original_title,description,release_year,genres,language,country,duration_minutes,quality,is_featured,view_count,rating,rating_count,created_at").eq("status","published").order("created_at",{ascending:false}),
    db.from("series").select("id,public_id,title,original_title,description,release_year,genres,language,country,quality,is_featured,view_count,rating,rating_count,created_at").eq("status","published").order("created_at",{ascending:false})
  ]);
  if(m.error)throw m.error;if(s.error)throw s.error;
  return json({ok:true,movies:m.data??[],series:s.data??[]});
}

async function seriesContent(url:URL){
  const id=String(url.searchParams.get("id")||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid id"},400);
  const {data:seasons,error}=await db.from("seasons").select("id,season_number,title").eq("series_id",id).eq("status","published").order("season_number",{ascending:true});
  if(error)throw error;
  const out=[];
  for(const season of seasons??[]){
    const {data:episodes,error:e}=await db.from("episodes").select("id,public_id,episode_number,title,description,duration_minutes,quality,rating,rating_count").eq("season_id",season.id).eq("status","published").order("episode_number",{ascending:true});
    if(e)throw e;
    out.push({...season,episodes:episodes??[]});
  }
  return json({ok:true,seasons:out});
}

async function favoritesApi(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  if(req.method==="GET"){
    const {data,error}=await db.from("favorites").select("entity_type,entity_id,created_at").eq("user_id",auth.user.id).order("created_at",{ascending:false});
    if(error)throw error;return json({ok:true,favorites:data??[]});
  }
  const body=await req.json().catch(()=>null);
  const type=String(body?.entity_type||""),id=String(body?.entity_id||""),enabled=Boolean(body?.enabled);
  if(!["movie","series"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid favorite"},400);
  if(enabled){
    const {error}=await db.from("favorites").upsert({user_id:auth.user.id,entity_type:type,entity_id:id});
    if(error)throw error;
  }else{
    const {error}=await db.from("favorites").delete().eq("user_id",auth.user.id).eq("entity_type",type).eq("entity_id",id);
    if(error)throw error;
  }
  return json({ok:true});
}

async function progressApi(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  if(req.method==="GET"){
    const {data,error}=await db.from("watch_progress").select("entity_type,entity_id,position_seconds,duration_seconds,updated_at").eq("user_id",auth.user.id).order("updated_at",{ascending:false}).limit(100);
    if(error)throw error;
    const rows:any[]=data??[];
    const episodeIds=rows.filter((x:any)=>x.entity_type==="episode").map((x:any)=>x.entity_id);
    const meta=new Map<string,any>();
    if(episodeIds.length){
      const {data:episodes}=await db.from("episodes").select("id,public_id,title,episode_number,season_id").in("id",episodeIds);
      const seasonIds=[...new Set((episodes??[]).map((x:any)=>x.season_id))];
      const {data:seasons}=seasonIds.length?await db.from("seasons").select("id,series_id,season_number").in("id",seasonIds):{data:[] as any[]};
      const seriesIds=[...new Set((seasons??[]).map((x:any)=>x.series_id))];
      const {data:series}=seriesIds.length?await db.from("series").select("id,title,status").in("id",seriesIds):{data:[] as any[]};
      const seasonMap=new Map((seasons??[]).map((x:any)=>[x.id,x]));
      const seriesMap=new Map((series??[]).map((x:any)=>[x.id,x]));
      for(const ep of episodes??[]){
        const se:any=seasonMap.get(ep.season_id);const sr:any=se?seriesMap.get(se.series_id):null;
        if(sr?.status==="published")meta.set(ep.id,{
          episode_public_id:ep.public_id,episode_title:ep.title,episode_number:ep.episode_number,
          season_number:se.season_number,series_id:sr.id,series_title:sr.title,
        });
      }
    }
    return json({ok:true,progress:rows.map((x:any)=>({...x,...(meta.get(x.entity_id)||{})}))});
  }
  const body=await req.json().catch(()=>null);
  const type=String(body?.entity_type||""),id=String(body?.entity_id||"");
  if(!["movie","episode"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid progress"},400);
  if(body?.remove===true){
    const {error}=await db.from("watch_progress").delete().eq("user_id",auth.user.id).eq("entity_type",type).eq("entity_id",id);
    if(error)throw error;
    return json({ok:true,removed:true});
  }
  const position=Math.max(0,Number(body?.position_seconds||0)),duration=Math.max(0,Number(body?.duration_seconds||0));
  const {error}=await db.from("watch_progress").upsert({user_id:auth.user.id,entity_type:type,entity_id:id,position_seconds:position,duration_seconds:duration,updated_at:new Date().toISOString()});
  if(error)throw error;return json({ok:true});
}

async function publicRequest(req:Request){
  const b=await req.json().catch(()=>null);
  if(!b) return json({error:"invalid body"},400);
  const requester=String(b.requester_key||"").trim();
  const type=String(b.request_type||"");
  const title=String(b.title||"").trim().slice(0,160);
  const note=String(b.note||"").trim().slice(0,500);
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(requester)||!["movie","series"].includes(type)||title.length<2) return json({error:"invalid request"},400);
  const allowed=await consumeRateLimit(requester,"content_request",5,24*60*60);
  if(!allowed) return json({error:"daily limit reached"},429);
  const {data,error}=await db.from("content_requests").insert({requester_key:requester,request_type:type,title,note})
    .select("request_code,status,title,request_type,created_at").single();
  if(error) throw error;
  try{
    const ch=await channel("requests");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:`طلب جديد\n${data.request_code}\nالنوع: ${type==="movie"?"فيلم":"مسلسل"}\nالاسم: ${title}\nملاحظة: ${note||"—"}`});
  }catch{}
  return json({ok:true,request:data},201);
}

async function requestStatus(url:URL){
  const k=String(url.searchParams.get("requester_key")||"");
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(k)) return json({error:"invalid key"},400);
  const {data,error}=await db.from("content_requests")
    .select("request_code,request_type,title,status,created_at,updated_at,linked_entity_type,linked_entity_id")
    .eq("requester_key",k).order("created_at",{ascending:false}).limit(20);
  if(error)throw error;
  const rows:any[]=data??[];
  const out=[];
  for(const row of rows){
    let linked:any=null;
    if(row.status==="added"&&row.linked_entity_id&&["movie","series"].includes(row.linked_entity_type)){
      const table=row.linked_entity_type==="movie"?"movies":"series";
      const {data:item}=await db.from(table).select("id,public_id,title,status").eq("id",row.linked_entity_id).maybeSingle();
      if(item?.status==="published")linked={type:row.linked_entity_type,id:item.id,public_id:item.public_id,title:item.title};
    }
    out.push({...row,linked});
  }
  return json({ok:true,requests:out});
}

async function publicReport(req:Request){
  const b=await req.json().catch(()=>null);
  if(!b) return json({error:"invalid body"},400);
  const reporter=String(b.reporter_key||"").trim();
  const type=String(b.entity_type||"");
  const publicId=String(b.entity_public_id||"").trim().slice(0,40);
  const reason=String(b.reason||"").trim().slice(0,160);
  const details=String(b.details||"").trim().slice(0,800);
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(reporter)||!["movie","series","episode","other"].includes(type)||reason.length<2) return json({error:"invalid report"},400);
  const allowed=await consumeRateLimit(reporter,"report",10,60*60);
  if(!allowed)return json({error:"report limit reached"},429);
  const {data,error}=await db.from("reports").insert({
    reporter_key:reporter,entity_type:type,entity_public_id:publicId,reason,details,
  }).select("report_code,status,created_at").single();
  if(error) throw error;
  try{
    const ch=await channel("reports");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:`بلاغ جديد\n${data.report_code}\nID: ${publicId||"—"}\nالسبب: ${reason}\nالتفاصيل: ${details||"—"}`});
  }catch{}
  return json({ok:true,report:data},201);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const url=new URL(req.url);
    if(req.method==="GET"&&url.searchParams.get("health")==="1"){
      return json({
        ok:true,name:"VAYZEN",maxVideoMB:800,
        botConfigured:Boolean(BOT_TOKEN),
        webhookSecretConfigured:Boolean(BOT_SECRET),
        streamGatewayConfigured:Boolean(await streamGateway()),
        streamSigningConfigured:Boolean(await streamSigningSecret()),
      });
    }
    if(req.method==="GET"&&url.searchParams.has("setup")){
      if(!BOT_SECRET||url.searchParams.get("setup")!==BOT_SECRET) return json({error:"unauthorized"},401);
      const webhook=`${SUPABASE_URL}/functions/v1/vayzen-gateway`;
      const r=await tg("setWebhook",{url:webhook,secret_token:BOT_SECRET,allowed_updates:["message","callback_query"],drop_pending_updates:true});
      return json({ok:true,webhook,telegram:r});
    }
    const action=url.searchParams.get("action");
    if(action==="bot_icon_asset"&&req.method==="GET"){
      const name=String(url.searchParams.get("name")||"") as BotUiIconKey;
      const b64=BOT_UI_ICON_PNGS[name];
      if(!b64)return new Response("not found",{status:404,headers:cors});
      const raw=atob(b64),bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      return new Response(bytes,{status:200,headers:{...cors,"Content-Type":"image/png","Cache-Control":"public, max-age=31536000, immutable"}});
    }
    if(action==="catalog"&&req.method==="GET") return catalog();
    if(action==="series_content"&&req.method==="GET") return seriesContent(url);
    if(action==="media_variants"&&req.method==="GET") return publicMediaVariants(url);
    if(action==="signup"&&req.method==="POST") return authSignup(req);
    if(action==="login"&&req.method==="POST") return authLogin(req);
    if(action==="refresh"&&req.method==="POST") return authRefresh(req);
    if(action==="me"&&req.method==="GET") return me(req);
    if(action==="profile"&&req.method==="POST") return updateProfile(req);
    if(action==="change_password"&&req.method==="POST") return changePassword(req);
    if(action==="view"&&req.method==="POST") return recordView(req);
    if(action==="favorites"&&(req.method==="GET"||req.method==="POST")) return favoritesApi(req);
    if(action==="progress"&&(req.method==="GET"||req.method==="POST")) return progressApi(req);
    if(req.method==="POST"&&action==="request_content") return publicRequest(req);
    if(req.method==="GET"&&action==="request_status") return requestStatus(url);
    if(req.method==="POST"&&action==="report") return publicReport(req);

    const mt=url.searchParams.get("media"),id=url.searchParams.get("id");
    if(req.method==="GET"&&mt&&id) return media(mt,id,req);

    if(req.method!=="POST") return json({error:"method not allowed"},405);
    if(!BOT_SECRET||req.headers.get("x-telegram-bot-api-secret-token")!==BOT_SECRET) return json({error:"bad webhook signature"},403);

    const u=await req.json();
    if(u.callback_query) await callback(u.callback_query);
    else if(u.message) await message(u.message);
    return json({ok:true});
  }catch(e){
    const msg=e instanceof Error?e.message:"unknown error";
    console.error(msg);
    await systemLog("error",msg);
    return json({error:"internal error"},500);
  }
});
