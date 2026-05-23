import { useCreatePost, useListAuthors } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PostInputCategory } from "@workspace/api-client-react";

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  excerpt: z.string().min(1, "Excerpt is required").max(300),
  content: z.string().min(1, "Content is required"),
  coverImageUrl: z.string().url("Must be a valid URL"),
  category: z.nativeEnum(PostInputCategory),
  tags: z.string().min(1, "At least one tag is required"),
  authorId: z.coerce.number().min(1, "Author is required"),
  location: z.string().optional(),
  bike: z.string().optional(),
});

export function NewPost() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: authors, isLoading: authorsLoading } = useListAuthors();
  const createMutation = useCreatePost();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      excerpt: "",
      content: "",
      coverImageUrl: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?q=80&w=2070&auto=format&fit=crop",
      category: "postmortem",
      tags: "",
      authorId: 0,
      location: "",
      bike: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    const tagsArray = values.tags.split(",").map(t => t.trim()).filter(Boolean);
    
    createMutation.mutate(
      {
        data: {
          ...values,
          tags: tagsArray,
        }
      },
      {
        onSuccess: (post) => {
          toast({
            title: "Post Published",
            description: "Your dispatch is now live.",
          });
          setLocation(`/posts/${post.slug}`);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to publish post. Check your data and try again.",
          });
        }
      }
    );
  }

  return (
    <div className="container max-w-3xl mx-auto px-4 py-12 pb-24">
      <div className="mb-12 border-b border-border pb-8">
        <h1 className="text-4xl md:text-5xl font-display font-bold uppercase tracking-tight leading-none mb-4">Write a Dispatch</h1>
        <p className="text-muted-foreground">Share your ride, review some gear, or drop some knowledge.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="uppercase font-bold tracking-wider text-xs">Title</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g. Trans-America Trail on a KLR650" className="text-xl font-display rounded-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="excerpt"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="uppercase font-bold tracking-wider text-xs">Excerpt</FormLabel>
                  <FormControl>
                    <Textarea placeholder="A short summary of the post..." className="rounded-none resize-none h-20" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="uppercase font-bold tracking-wider text-xs">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="rounded-none">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="postmortem">Postmortem</SelectItem>
                      <SelectItem value="debugging">Debugging</SelectItem>
                      <SelectItem value="backend">Backend</SelectItem>
                      <SelectItem value="product">Product</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="authorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="uppercase font-bold tracking-wider text-xs">Author</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value.toString()}>
                    <FormControl>
                      <SelectTrigger className="rounded-none">
                        <SelectValue placeholder={authorsLoading ? "Loading..." : "Select author"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {authors?.map(author => (
                        <SelectItem key={author.id} value={author.id.toString()}>{author.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="uppercase font-bold tracking-wider text-xs">Tags</FormLabel>
                  <FormControl>
                    <Input placeholder="honda, dual-sport, maintenance (comma separated)" className="rounded-none font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="coverImageUrl"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="uppercase font-bold tracking-wider text-xs">Cover Image URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." className="rounded-none font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 border p-6 bg-muted/10">
              <div className="md:col-span-2 mb-[-1rem]">
                <h3 className="font-display font-bold uppercase tracking-wider text-sm text-primary">Context (Optional)</h3>
              </div>
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase font-bold tracking-wider text-xs">Location</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g. Moab, Utah" className="rounded-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase font-bold tracking-wider text-xs">Bike Used</FormLabel>
                    <FormControl>
                      <Input placeholder="E.g. 2018 Honda Africa Twin" className="rounded-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="uppercase font-bold tracking-wider text-xs flex justify-between">
                    <span>Content</span>
                    <span className="text-muted-foreground font-normal normal-case">Markdown supported</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Write your story here..." 
                      className="rounded-none min-h-[400px] font-mono text-sm leading-relaxed" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="pt-6 border-t border-border flex justify-end">
            <Button 
              type="submit" 
              size="lg" 
              className="rounded-none uppercase tracking-widest font-bold text-lg px-12"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Publishing..." : "Publish Dispatch"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
